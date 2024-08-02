require("dotenv").config()
const fs = require('fs');
const csv = require('csv-parser');
const { format, parseISO } = require('date-fns');
const path = require('path');

const CSV_FILE_PATH = path.join(__dirname, 'hegg-data.csv');
const PVOUTPUT_API_URL = 'https://pvoutput.org/service/r2/addbatchstatus.jsp';
const {
    PVOUTPUT_API_KEY,
    PVOUTPUT_SYSTEM_ID,
} = process.env;

const UPLOAD_ENABLED=false;

async function uploadToPVOutput(bulkData) {
    const url = PVOUTPUT_API_URL;
    const headers = {
        'X-Pvoutput-Apikey': PVOUTPUT_API_KEY,
        'X-Pvoutput-SystemId': PVOUTPUT_SYSTEM_ID,
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: `data=${bulkData.join(';')}`
    });

    if (!response.ok) {
        throw new Error(`Failed to upload data: ${response.statusText}`);
    }
}

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

async function saveProgress(index) {
    await fs.promises.writeFile('progress.txt', index.toString(), 'utf8');
}
async function saveOutput(data, index) {
    await fs.promises.writeFile(`hegg_pvoutput-${index}.csv`, data, 'utf8');
}
async function loadProgress() {
    try {
        const data = await fs.promises.readFile('progress.txt', 'utf8');
        return parseInt(data, 10);
    } catch (error) {
        return 0; // Start bij 0 als er geen voortgangsbestand is
    }
}

async function readCsvAndUpload() {
    const records = [];
    const dailyData = {};

    fs.createReadStream(CSV_FILE_PATH)
        .pipe(csv())
        .on('data', (data) => records.push(data))
        .on('end', async () => {
            for (const record of records) {
                const date = format(parseISO(record.date), 'dd-MM-yyyy');
                const time = format(parseISO(record.date), 'HH:mm');
                const consumption = parseFloat(record.consumption) * 1000; // kWh to Wh
                
                if (!dailyData[date]) {
                    dailyData[date] = {
                        date,
                        consumption: 0,
                        export: 0,
                        total_cost: 0,
                        peak_power: 0,
                        peak_time: ""
                    };
                }

                if (consumption > dailyData[date].peak_power) {
                    dailyData[date].peak_power = consumption;
                    dailyData[date].peak_time = time;
                }

                dailyData[date].consumption += parseFloat(record.consumption) * 1000; // kWh to Wh
                dailyData[date].export += parseFloat(record.export) * 1000; // kWh to Wh
                dailyData[date].total_cost += parseFloat(record.total_cost)// * 100; // Euros to cents
            }

            const bulkData = Object.values(dailyData).map(data => {
                return `${data.date},${data.consumption.toFixed(0)},${data.export.toFixed(0)},${data.total_cost.toFixed(0)},${data.peak_power.toFixed(0)},${data.peak_time}`;
            });

            const bulkDataChunks = chunkArray(bulkData, 200);
            let startIndex = await loadProgress();

            for (let i = startIndex; i < bulkDataChunks.length; i++) {
                const chunk = bulkDataChunks[i];
                try {
                    if(UPLOAD_ENABLED) await uploadToPVOutput(chunk); // Disabled, use csv bulk upload
                    await saveOutput(chunk.join(';\n'), i + 1)
                    console.log(`Successfully uploaded batch of ${chunk.length} entries`);
                    await saveProgress(i + 1);
                } catch (error) {
                    console.error('Failed to upload batch:', error);
                }

                // Wacht 15 minuten voor de volgende upload
                //await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
            }
        });
}

readCsvAndUpload().catch(error => console.error('Error reading CSV:', error));
