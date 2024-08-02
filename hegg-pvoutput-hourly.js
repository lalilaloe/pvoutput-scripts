const fs = require('fs');
const csv = require('csv-parser');
const { format, parseISO } = require('date-fns');
const path = require('path');

const CSV_FILE_PATH = path.join(__dirname, 'hegg-data.csv');
const PVOUTPUT_API_URL = 'https://pvoutput.org/service/r2/addstatus.jsp';
const {
    PVOUTPUT_API_KEY,
    PVOUTPUT_SYSTEM_ID,
} = process.env;

async function uploadToPVOutput(data) { // key=${PVOUTPUT_API_KEY}&sid=${PVOUTPUT_SYSTEM_ID}&
    const url = `${PVOUTPUT_API_URL}?d=${data.date}&t=${data.time}&v3=${data.consumption}&v6=${data.total_cost}`;
    console.log(url)
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Pvoutput-Apikey': PVOUTPUT_API_KEY,
            'X-Pvoutput-SystemId': PVOUTPUT_SYSTEM_ID,
        }
    });

    if (!response.ok) {
        console.error(await response.text())
        throw new Error(`Failed to upload data: ${response.statusText}`);
    }
}

async function readCsvAndUpload() {
    const records = [];

    fs.createReadStream(CSV_FILE_PATH)
        .pipe(csv())
        .on('data', (data) => records.push(data))
        .on('end', async () => {
            for (const record of records) {
                const date = format(parseISO(record.date), 'yyyyMMdd');
                const time = format(parseISO(record.date), 'HH:mm');
                
                const data = {
                    date,
                    time,
                    consumption: Math.round(parseFloat(record.consumption) * 1000), // kWh to Wh
                    total_cost: Math.round(parseFloat(record.total_cost) * 100), // Euros to cents
                };

                try {
                    await uploadToPVOutput(data);
                    console.log(`Successfully uploaded data for ${data.date} ${data.time}`);
                } catch (error) {
                    console.error(`Failed to upload data for ${data.date} ${data.time}:`, error);
                }

                // Wacht een beetje voor de volgende verzoek om de server niet te overbelasten
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        });
}

readCsvAndUpload().catch(error => console.error('Error reading CSV:', error));
