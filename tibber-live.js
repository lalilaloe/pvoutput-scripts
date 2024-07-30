const url = require('url');
const { TibberFeed, TibberQuery } = require('tibber-api');
require('dotenv').config();

// Configuration
const {
    TIBBER_API_TOKEN,
    TIBBER_HOME_ID,
    PVOUTPUT_API_KEY,
    PVOUTPUT_SYSTEM_ID,
    KNMI_API_KEY
} = process.env;

let lastUploadMinute = null;
let uploading = false;

let powerReadings = [];

async function uploadToPVOutput(data) {
    const timestamp = new Date(data.timestamp);
    const currentMinute = Math.floor(timestamp.getMinutes() / 5) * 5 + 1; // Round down to the nearest 5-minute block, + 1 to upload same as solar panels
    
    if (data.power !== null && data.power !== undefined) {
        powerReadings.push(data.power);
        //if(data.power) console.log("Received power reading", data.power)
    }

    if (lastUploadMinute !== currentMinute && !uploading) {
        uploading = true
        const date = timestamp.toISOString().split('T')[0].replace(/-/g, ''); // yyyymmdd format
        const time = timestamp.toTimeString().split(' ')[0].slice(0, 5); // hh:mm format
        const consumption = (data.accumulatedConsumption * 1000).toFixed(0); // kWh to Wh
        const exported = (data.powerProduction || 0).toFixed(0); // W
        let powerConsumed = (data.power || 0).toFixed(0); // W
        if (powerReadings.length > 0) {
            const totalPower = powerReadings.reduce((sum, value) => sum + value, 0);
            const averagePower = totalPower / powerReadings.length;
            powerConsumed = averagePower.toFixed(0)
        }       

        const body = new URLSearchParams({
            d: date,
            t: time,
            //v2: exported,
            v3: consumption,
            v4: powerConsumed,
            //n: 1
        });

        try {
            const response = await fetch('https://pvoutput.org/service/r2/addstatus.jsp', {
                method: 'POST',
                headers: {
                    'X-Pvoutput-Apikey': PVOUTPUT_API_KEY,
                    'X-Pvoutput-SystemId': PVOUTPUT_SYSTEM_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString(),
            });

            if (!response.ok) {
                console.error(`Failed to upload data: ${response.statusText}`);
                uploading = false;
            } else {
                console.log(`Data uploaded successfully for ${date} at ${time}`);
                lastUploadMinute = currentMinute;
                console.log(powerReadings.length > 1 ? "Average (" + powerReadings.length + " readings) Power: " : "Power:", powerConsumed, "Exported:", exported, "Consumption:", consumption)
                // Clear readings for the next interval
                powerReadings = [];
                uploading = false;
            }
        } catch (error) {
            console.error(`Error uploading data to PVOutput: ${error.message}`);
            uploading = false;
        }
    }
}

async function fetchKNMITemperature() {
    // Example function to fetch temperature from KNMI API
    const api_url = "https://api.dataplatform.knmi.nl/open-data";
    const api_version = "v1";
    const dataset_name = "Actuele10mindataKNMIstations";
    const dataset_version = "2";

    const now = new Date();
    const timestamp_one_hour_ago = new Date(now - 3600000 - (now.getMinutes() % 10) * 60000);
    const filename = `KMDS__OPER_P___10M_OBS_L2_${timestamp_one_hour_ago.toISOString().replace(/[-:]/g, '').slice(0, 12)}.nc`;

    const endpoint = `${api_url}/${api_version}/datasets/${dataset_name}/versions/${dataset_version}/files/${filename}/url`;

    try {
        const get_file_response = await fetch(endpoint, { headers: { "Authorization": KNMI_API_KEY } });
        if (!get_file_response.ok) {
            throw new Error("Unable to retrieve download url for file");
        }

        const { temporaryDownloadUrl } = await get_file_response.json();
        const dataResponse = await fetch(temporaryDownloadUrl);
        const data = await dataResponse.text();

        // Parse the data to extract the temperature for Zwolle
        // Assuming the temperature data is in the form of a CSV or similar format
        // Placeholder: parse CSV and extract the temperature for the closest station to Zwolle
        const temperature = parseFloat(extractTemperatureFromData(data));
        return temperature;
    } catch (error) {
        console.error(`Error fetching KNMI data: ${error.message}`);
        return null;
    }
}


// Config object for TibberQuery
const config = {
    active: true,
    apiEndpoint: {
        apiKey: TIBBER_API_TOKEN,
        queryUrl: 'https://api.tibber.com/v1-beta/gql',
        requestTimeout: 5000,
    },
    homeId: TIBBER_HOME_ID,
    timestamp: true,
    power: true,
    lastMeterConsumption:true,
    accumulatedConsumption:true,
    accumulatedProduction:true,
    accumulatedProductionLastHour:true,
    accumulatedConsumptionLastHour:true,
    accumulatedCost:true,
    accumulatedReward:true,
    currency:true,
    minPower:true,
    averagePower:true,
    maxPower:true,
    powerProduction:true,
    minPowerProduction:true,
    maxPowerProduction:true,
    lastMeterProduction:true,
    powerFactor:true,
    voltagePhase1:true,
    voltagePhase2:true,
    voltagePhase3:true,
    currentL1:true,
    currentL2:true,
    currentL3:true,
    signalStrength:true,
};

// Initialize TibberFeed and TibberQuery
const tibberQuery = new TibberQuery(config);
const tibberFeed = new TibberFeed(tibberQuery, 5000);

// Subscribe to TibberFeed events
tibberFeed.on('connected', () => {
    //console.log('Connected to Tibber!');
});

tibberFeed.on('connection_ack', () => {
    console.log('Connection reset');
});

tibberFeed.on('disconnected', async () => {
    //console.log('Disconnected from Tibber!');
});

tibberFeed.on('error', async error => {
    //console.error(error);
});

tibberFeed.on('warn', warn => {
    //console.warn(warn);
});

tibberFeed.on('log', log => {
    //console.log(log);
});

tibberFeed.on('data', async data => {
    // const temperature = await fetchKNMITemperature();
    // console.log("temperature", temperature)
    //console.log(data)
    uploadToPVOutput(data);
});

tibberFeed.connect();

// setInterval(async () => { // Keep connection alive
//     if (!tibberFeed.connected) {
//         await tibberFeed.connect();
//     }
// }, 1000);