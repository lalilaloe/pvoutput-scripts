
const fs = require('fs');
const { format, addDays } = require('date-fns');
const csvWriter = require('csv-write-stream');
const path = require('path');

const {
    HEGG_TOKEN, // Get from network request in browser console (network tab)
} = process.env;

const API_URL = "https://api.energyzero.nl/v1/usage/";
const COST_API_URL = "https://api.energyzero.nl/v1/cost/";
const API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.5",
    "X-Auth": "Bearer " + HEGG_TOKEN,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "Priority": "u=0"
};
const START_DATE = new Date('2022-01-28'); // Set accordingly
const END_DATE = new Date('2024-02-29');
const CSV_FILE_PATH = path.join(__dirname, 'hegg-data.csv');

async function fetchData(url) {
    const response = await fetch(url, { headers: API_HEADERS });
    const data = await response.json();
    return data;
}

function combineData(consumptionData, exportData, costData) {
    const combined = {};

    consumptionData.forEach(record => {
        const date = record.reading_date;
        if (!combined[date]) {
            combined[date] = { date, consumption: 0, export: 0, consumption_cost: 0, export_cost: 0, total_usage: 0, total_cost: 0, epex: 0, belasting: 0, inkoop: 0, netbeheer: 0, ode: 0, vast: 0, vermindering: 0 };
        }
        combined[date].consumption += record.reading;
        combined[date].consumption_cost += record.cost;
    });

    exportData.forEach(record => {
        const date = record.reading_date;
        if (!combined[date]) {
            combined[date] = { date, consumption: 0, export: 0, consumption_cost: 0, export_cost: 0, total_usage: 0, total_cost: 0, epex: 0, belasting: 0, inkoop: 0, netbeheer: 0, ode: 0, vast: 0, vermindering: 0 };
        }
        combined[date].export += record.reading;
        combined[date].export_cost += record.cost;
    });

    costData.forEach(record => {
        const date = record.reading_date;
        if (!combined[date]) {
            combined[date] = { date, consumption: 0, export: 0, consumption_cost: 0, export_cost: 0, total_usage: 0, total_cost: 0, epex: 0, belasting: 0, inkoop: 0, netbeheer: 0, ode: 0, vast: 0, vermindering: 0 };
        }
        combined[date].total_usage = record.usage;
        combined[date].total_cost = record.total_incl;
        combined[date].epex = record.total_per_setting["Dagprijs EPEX per kWh"];
        combined[date].belasting = record.total_per_setting["Energiebelasting per kWh"];
        combined[date].inkoop = record.total_per_setting["Inkoopkosten per kWh"];
        combined[date].netbeheer = record.total_per_setting["Netbeheerkosten stroom"];
        combined[date].ode = record.total_per_setting["ODE per kWh"];
        combined[date].vast = record.total_per_setting["Vaste leveringskosten"];
        combined[date].vermindering = record.total_per_setting["Vermindering Energiebelasting"];
    });

    return Object.values(combined);
}

async function saveToCsv(data) {
    const writer = csvWriter({ headers: ["date", "consumption", "export", "consumption_cost", "export_cost", "total_usage", "total_cost", "epex", "belasting", "inkoop", "netbeheer", "ode", "vast", "vermindering"], sendHeaders: !fs.existsSync(CSV_FILE_PATH) });
    writer.pipe(fs.createWriteStream(CSV_FILE_PATH, { flags: 'a' }));

    data.forEach(record => {
        writer.write(record);
    });

    writer.end();
}

(async () => {
    let currentDate = START_DATE;

    while (currentDate <= END_DATE) {
        const nextDate = addDays(currentDate, 7);

        try {
            const consumptionUrl = `${API_URL}?dateFrom=${currentDate.toISOString()}&dateTill=${nextDate.toISOString()}&intervalType=3&snapshotID=3ae033ec-e333-4f6b-bc32-bbe45784fc17&usageType=1`;
            const exportUrl = `${API_URL}?dateFrom=${currentDate.toISOString()}&dateTill=${nextDate.toISOString()}&intervalType=3&snapshotID=3ae033ec-e333-4f6b-bc32-bbe45784fc17&usageType=2`;
            const costUrl = `${COST_API_URL}?calculationDetails=true&dateFrom=${currentDate.toISOString()}&dateTill=${nextDate.toISOString()}&intervalType=3&snapshotID=3ae033ec-e333-4f6b-bc32-bbe45784fc17&usageType=1`;

            const [consumptionData, exportData, costData] = await Promise.all([
                fetchData(consumptionUrl),
                fetchData(exportUrl),
                fetchData(costUrl)
            ]);

            if(consumptionData.length < 10 && exportData.length < 10 && costData.length < 169 ) console.error("Not enough data", format(currentDate, 'yyyy-MM-dd'), consumptionData.length, exportData.length, costData.length)
            if(consumptionData.length < 169) console.log("smaller dataset", consumptionData.length, exportData.length, costData.length)
            const combinedData = combineData(consumptionData, exportData, costData);
            await saveToCsv(combinedData);
    console.log(`Saved ${format(currentDate, 'yyyy-MM-dd')} to ${format(nextDate, 'yyyy-MM-dd')}`, combinedData.length)

        } catch (error) {
            console.error(`Failed to fetch data for period ${format(currentDate, 'yyyy-MM-dd')} to ${format(nextDate, 'yyyy-MM-dd')}:`, error);
        }

        // Wait to relax server requests
        await new Promise(resolve => setTimeout(resolve, 1000));

        currentDate = nextDate;
    }
})();
