/**
 * Quinovic — Google Ads BACKFILL Script
 * 
 * ONE-TIME USE: Backfills historical data from START_DATE to yesterday.
 * Run manually in Google Ads Scripts, then disable/delete.
 * 
 * SETUP:
 * 1. Replace SPREADSHEET_URL with your Google Sheet URL
 * 2. Set START_DATE to earliest date you want (account start ~Oct 2025)
 * 3. Run via Preview first to check output
 * 4. Run once, then remove from Scripts
 * 
 * NOTE: Google Ads Scripts have a 30-minute execution limit.
 * If you have many months of data, you may need to run in batches
 * by adjusting START_DATE each time.
 */

var CONFIG = {
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1sujF64sQA_Zx0ASCiXcvML9UhxsD5F9N-oP-LtrtErs/edit',
  SHEET_NAME: 'data',
  START_DATE: '2025-10-01',  // Adjust to actual account start
};

function main() {
  var ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      'Date', 'Campaign Name', 'Region', 'Clicks', 'Impressions',
      'CTR', 'Avg CPC', 'Cost', 'Search Impr Share',
      'Impr Share (Top)', 'Impr Share (Abs Top)'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  
  // Build existing pairs for dedup
  var existingPairs = getExistingDateCampaignPairs(sheet);
  var existingCount = Object.keys(existingPairs).length;
  Logger.log('Found ' + existingCount + ' existing rows — will skip duplicates');
  
  // Calculate date range
  var yesterday = getYesterdayString();
  Logger.log('Backfilling from ' + CONFIG.START_DATE + ' to ' + yesterday);
  
  // Query full date range
  var report = AdsApp.report(
    'SELECT ' +
      'segments.date, ' +
      'campaign.name, ' +
      'metrics.clicks, ' +
      'metrics.impressions, ' +
      'metrics.ctr, ' +
      'metrics.average_cpc, ' +
      'metrics.cost_micros, ' +
      'metrics.search_impression_share, ' +
      'metrics.search_top_impression_share, ' +
      'metrics.search_absolute_top_impression_share ' +
    'FROM campaign ' +
    'WHERE segments.date BETWEEN "' + CONFIG.START_DATE + '" AND "' + yesterday + '" ' +
      'AND campaign.status = "ENABLED"'
  );
  
  var rows = report.rows();
  var newRows = [];
  var skipped = 0;
  
  while (rows.hasNext()) {
    var row = rows.next();
    var date = row['segments.date'];
    var campaignName = row['campaign.name'];
    var key = date + '|' + campaignName;
    
    if (existingPairs[key]) {
      skipped++;
      continue;
    }
    
    var region = extractRegion(campaignName);
    
    var costMicros = parseFloat(row['metrics.cost_micros']) || 0;
    var cost = costMicros / 1000000;
    
    var avgCpcMicros = parseFloat(row['metrics.average_cpc']) || 0;
    var avgCpc = avgCpcMicros / 1000000;
    
    newRows.push([
      date,
      campaignName,
      region,
      parseInt(row['metrics.clicks']) || 0,
      parseInt(row['metrics.impressions']) || 0,
      parseFloat(row['metrics.ctr']) || 0,
      avgCpc,
      cost,
      row['metrics.search_impression_share'] || '--',
      row['metrics.search_top_impression_share'] || '--',
      row['metrics.search_absolute_top_impression_share'] || '--'
    ]);
  }
  
  // Batch write — much faster than row-by-row
  if (newRows.length > 0) {
    // Sort by date ascending
    newRows.sort(function(a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    
    sheet.getRange(
      sheet.getLastRow() + 1, 1,
      newRows.length, newRows[0].length
    ).setValues(newRows);
  }
  
  Logger.log('BACKFILL COMPLETE');
  Logger.log('New rows written: ' + newRows.length);
  Logger.log('Duplicates skipped: ' + skipped);
  Logger.log('Total rows in sheet: ' + sheet.getLastRow());
}

function getYesterdayString() {
  var now = new Date();
  now.setDate(now.getDate() - 1);
  return Utilities.formatDate(now, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
}

function getExistingDateCampaignPairs(sheet) {
  var pairs = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return pairs;
  
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var date = data[i][0];
    if (date instanceof Date) {
      date = Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
    }
    pairs[date + '|' + data[i][1]] = true;
  }
  return pairs;
}

function extractRegion(campaignName) {
  if (campaignName.indexOf(' | ') !== -1) {
    var parts = campaignName.split(' | ');
    if (parts.length >= 2) return parts[1].trim();
  }
  var dashParts = campaignName.split(' - ');
  if (dashParts.length > 1) return dashParts[dashParts.length - 1].trim();
  return 'Auckland';
}
