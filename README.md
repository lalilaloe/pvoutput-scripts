# Pvoutput scripts

Scripts for Tibber and Hegg to upload historic values and live data to [PVOutput](https://pvoutput.org)

Make sure to use node 16+ and `run npm install` before folowing instructions below.

## Tibber

Get your API token from https://developer.tibber.com/

Make sure `.env` file is present or environment variables are set:
```PVOUTPUT_SYSTEM_ID=
PVOUTPUT_API_KEY=
TIBBER_API_TOKEN=
TIBBER_HOME_ID=
```

### Live data upload

Comment or uncomment the values you want to upload at `line 50` in `tibber-live.js`, default v2(export), v3(import), v4(power), and v7 ,v8 for tarrifs see https://forum.pvoutput.org/t/tariff-feeds/5798

1. Run `node tibber-live.js`. (Uploads every 5 minutes, reconnects automatically)

### Hourly data upload to PVOutput

Take note, that this data is partly incomplete due to Tibber only providing Kwh value which is often below 0.00 Kwh missing resolution

1. Modify start + end date in `tibber-pvoutput-hourly.js` script
2. Run `node tibber-pvoutput-hourly.js`.

### Historic daily values import in PVOutput

For historic data you can use manual bulk csv uploader in browser (https://pvoutput.org/load.jsp)

1. Run `node tibber-pvoutput-historic.js` to get the `tibber_pvoutput_data.csv`
2. Go to https://pvoutput.org/load.jsp, make sure the import settings match the csv
 1: Output Date
 2: Consumption
 3: Exported
 optional:
 4: Comments (profit)

3. Copy and past the csv rows (max 200). Hit the `load` button


## Hegg

### Data export (Hourly)
1. Get token from network request in browser (logged in)
2. Modify start + end date in `hegg-data-csv.js` script
3. Run `node hegg-data-csv.js`. Make sure HEGG_TOKEN is set as environment variable or present in `.env` or run with `HEGG_TOKEN=<TOKEN HERE> node hegg-data-csv.js`
4. Check output in `hegg-data.csv`

### Hourly data upload to PVOutput
Warning: not tested due to my data being from +90 days ago

1. Get token from network request in browser (logged in)
2. Modify start + end date in `hegg-data-csv.js` script
3. Run `node hegg-pvoutput-hourly`. Make sure `PVOUTPUT_SYSTEM_ID` and `PVOUTPUT_API_KEY` are set as environment variable

### Historic daily values import in PVOutput
First make sure the hegg-data.csv is filled with data from the dates you want

1. Choose either manual bulk csv upload in browser (https://pvoutput.org/load.jsp) or via batch upload (instructions below)
2. Run `node hegg-pvoutput-historic.js`. Make sure `PVOUTPUT_SYSTEM_ID` and `PVOUTPUT_API_KEY` are set as environment variable
3. Csv uploads are done in chunks of max. 200, they should export to `hegg_pvoutput-<CHUNK_INDEX>` progress is saved to `progress.txt`
4. Go to https://pvoutput.org/load.jsp, make sure the import settings match the csv
 1: Output Date
 2: Consumption
 3: Exported
 optional:
 5: Peak Power
 6: Peak Time
 4: Comments (total_cost)

5. Copy and past the csv rows. Hit the `load` button

Batch upload (Warning: not tested due to data +90 days ago)

1. Upload via batch (only donation and up to 90 days ago) then set `UPLOAD_ENABLED` to `true`
2. Run `node hegg-pvoutput-historic.js`. Make sure `PVOUTPUT_SYSTEM_ID` and `PVOUTPUT_API_KEY` are set as environment variable
3. Check if values are correctly added


