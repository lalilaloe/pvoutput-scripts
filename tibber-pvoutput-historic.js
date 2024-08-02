require('dotenv').config();
const fs = require('fs');
const { format } = require('date-fns');

const { TIBBER_API_TOKEN, TIBBER_HOME_ID } = process.env;

const API_ENDPOINT = 'https://api.tibber.com/v1-beta/gql';
const CSV_FILE_PATH = 'tibber_pvoutput_data.csv';

const formatDateToBase64Cursor = (date) => {
    const isoString = date.toISOString();
    return Buffer.from(isoString).toString('base64');
};

const startDate = new Date('2024-05-01T00:00:00Z'); // Set accordingly
const endDate = new Date('2024-07-26T00:00:00Z');

const query = (cursor) => ({
    query: `
        {
            viewer {
                home(id: "${TIBBER_HOME_ID}") {
                    consumption(first: 100, resolution: DAILY, after: "${cursor}") {
                        nodes {
                            from
                            to
                            consumption
                            consumptionUnit
                        }
                    }
                    production(first: 100, resolution: DAILY, after: "${cursor}") {
                        nodes {
                            from
                            to
                            production
                            productionUnit
                            profit
                            currency
                        }
                    }
                }
            }
        }
    `,
});

const fetchTibberData = async (cursor) => {
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TIBBER_API_TOKEN}`,
            },
            body: JSON.stringify(query(cursor)),
        });

        if (!response.ok) {
            throw new Error(`Error fetching data: ${response.statusText}`);
        }

        const data = await response.json();
        const consumptionData = data.data.viewer.home.consumption.nodes;
        const productionData = data.data.viewer.home.production.nodes;
        console.log(consumptionData.length, productionData.length)
        return { consumptionData, productionData };
    } catch (error) {
        console.error('Error fetching data from Tibber:', error);
        return { consumptionData: [], productionData: [] };
    }
};

const saveToCsv = (consumptionData, productionData) => {
    const fileStream = fs.createWriteStream(CSV_FILE_PATH);
    fileStream.write(`Date,Consumption (Wh),Production (Wh),Profit (currency),Currency\n`);
    
    consumptionData.forEach(({ from, consumption }, index) => {
        const date = format(new Date(from), 'dd-MM-yyyy');
        const consumptionWh = (consumption * 1000).toFixed(0); // kWh naar Wh
        const production = productionData[index] || {};
        const productionWh = (production.production * 1000).toFixed(0) || '0';
        const profit = production.profit || '0';
        const currency = production.currency || '';

        fileStream.write(`${date},${consumptionWh},${productionWh},${profit},${currency}\n`);
    });

    fileStream.end();
    console.log(`Data successfully written to ${CSV_FILE_PATH}`);
};

const main = async () => {
    const cursor = formatDateToBase64Cursor(startDate);
    const { consumptionData, productionData } = await fetchTibberData(cursor);
    const filteredConsumptionData = consumptionData.filter(({ from }) => new Date(from) <= endDate);
    const filteredProductionData = productionData.filter(({ from }) => new Date(from) <= endDate);
    console.log(filteredConsumptionData.length, filteredProductionData.length)
    saveToCsv(filteredConsumptionData, filteredProductionData);
};

main().catch(console.error);
