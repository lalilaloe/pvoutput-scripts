require('dotenv').config();
const { format } = require('date-fns');

const { TIBBER_API_TOKEN, TIBBER_HOME_ID, PVOUTPUT_API_KEY, PVOUTPUT_SYSTEM_ID } = process.env;

const API_ENDPOINT = 'https://api.tibber.com/v1-beta/gql';
const UPLOAD_ENDPOINT = 'https://pvoutput.org/service/r2/addbatchstatus.jsp';

// Date range for data retrieval
const startDate = new Date('2024-05-01T00:00:00Z');
const endDate = new Date('2024-07-26T00:00:00Z');

// Helper function to format date to Base64 cursor
const formatDateToBase64Cursor = (date) => {
    const isoString = date.toISOString();
    return Buffer.from(isoString).toString('base64');
};

// GraphQL query function
const query = (cursor) => ({
    query: `
        {
            viewer {
                home(id: "${TIBBER_HOME_ID}") {
                    consumption(first: 1000, resolution: HOURLY, after: "${cursor}") {
                        nodes {
                            from
                            to
                            consumption
                        }
                    }
                    production(first: 1000, resolution: HOURLY, after: "${cursor}") {
                        nodes {
                            from
                            to
                            production
                            profit
                            currency
                        }
                    }
                }
            }
        }
    `,
});

// Function to fetch Tibber data
const fetchTibberData = async (start, end) => {
    let cursor = formatDateToBase64Cursor(start);
    let allConsumptionData = [];
    let allProductionData = [];

    while (new Date(start) < new Date(end)) {
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

            if (consumptionData.length === 0 && productionData.length === 0) break;

            allConsumptionData = [...allConsumptionData, ...consumptionData];
            allProductionData = [...allProductionData, ...productionData];

            cursor = formatDateToBase64Cursor(new Date(consumptionData[consumptionData.length - 1].from));
            start = new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000); // Move to the next week
        } catch (error) {
            console.error('Error fetching data from Tibber:', error);
            break;
        }
    }

    return { allConsumptionData, allProductionData };
};

const UPLOAD_BATCH_SIZE = 100;

const uploadToPVOutput = async (consumptionData, productionData) => {
    const data = consumptionData.map((consumption, index) => {
        const production = productionData[index] || {};
        const date = format(new Date(consumption.from), 'yyyyMMdd');
        const time = format(new Date(consumption.from), 'HH:mm');
        const consumptionWh = (consumption.consumption * 1000).toFixed(0); // Convert kWh to Wh
        const productionWh = (production.production * 1000).toFixed(0) || '0';
        const profit = (production.profit * 100).toFixed(0) || '0'; // Convert to cents if needed

        return `${date},${time},${productionWh},0,${consumptionWh},0,${profit}`;
    });

    // Chunk the data into batches of UPLOAD_BATCH_SIZE
    for (let i = 0; i < data.length; i += UPLOAD_BATCH_SIZE) {
        const batch = data.slice(i, i + UPLOAD_BATCH_SIZE);
        const body = `data=${batch.join(';')}`;

        try {
            const response = await fetch(UPLOAD_ENDPOINT, {
                method: 'POST',
                headers: {
                    'X-Pvoutput-Apikey': PVOUTPUT_API_KEY,
                    'X-Pvoutput-SystemId': PVOUTPUT_SYSTEM_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body
            });

            if (!response.ok) {
                console.error(`Failed to upload data batch: ${response.statusText}`);
            } else {
                console.log(`Batch ${i / UPLOAD_BATCH_SIZE + 1} uploaded successfully: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error uploading data batch to PVOutput: ${error.message}`);
        }
    }
};

const main = async () => {
    const { allConsumptionData, allProductionData } = await fetchTibberData(startDate, endDate);
    uploadToPVOutput(allConsumptionData, allProductionData);
};

main().catch(console.error);
