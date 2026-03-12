/**
 * Quinovic — Google Ads Daily Export Script
 * 
 * Runs daily (schedule in Google Ads: Scripts > Frequency > Daily).
 * Exports PREVIOUS day's campaign data to a Google Sheet.
 * 
 * SETUP:
 * 1. Replace SPREADSHEET_URL with your Google Sheet URL
 * 2. In Google Ads: Tools > Scripts > New Script > paste this
 * 3. Authorise, test with Preview, then schedule Daily
 */

var CONFIG = {
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1sujF64sQA_Zx0ASCiXcvML9UhxsD5F9N-oP-LtrtErs/edit',
  SHEET_NAME: 'data',
  // Date range: previous day
  DATE_RANGE: 'YESTERDAY'
};

function main() {
  var ss = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    // Write headers
    sheet.appendRow([
      'Date', 'Campaign Name', 'Region', 'Clicks', 'Impressions',
      'CTR', 'Avg CPC', 'Cost', 'Search Impr Share',
      'Impr Share (Top)', 'Impr Share (Abs Top)'
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  
  // Get yesterday's date string for dedup check
  var yesterday = getYesterdayString();
  var existingDates = getExistingDateCampaignPairs(sheet);
  
  // Query campaign performance
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
    'WHERE segments.date = "' + yesterday + '" ' +
      'AND campaign.status = "ENABLED"'
  );
  
  var rows = report.rows();
  var newRows = [];
  
  while (rows.hasNext()) {
    var row = rows.next();
    var date = row['segments.date'];
    var campaignName = row['campaign.name'];
    var key = date + '|' + campaignName;
    
    // Skip if already exported
    if (existingDates[key]) {
      Logger.log('Skipping duplicate: ' + key);
      continue;
    }
    
    // Extract region from campaign name (assumes format "Campaign - Region")
    var region = extractRegion(campaignName);
    
    // Cost is in micros, convert to dollars
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
  
  // Append all new rows at once
  if (newRows.length > 0) {
    sheet.getRange(
      sheet.getLastRow() + 1, 1,
      newRows.length, newRows[0].length
    ).setValues(newRows);
    Logger.log('Exported ' + newRows.length + ' rows for ' + yesterday);
  } else {
    Logger.log('No new data to export for ' + yesterday);
  }
}

/**
 * Get yesterday's date as YYYY-MM-DD
 */
function getYesterdayString() {
  var now = new Date();
  now.setDate(now.getDate() - 1);
  return Utilities.formatDate(now, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
}

/**
 * Build a set of existing date|campaign pairs for deduplication
 */
function getExistingDateCampaignPairs(sheet) {
  var pairs = {};
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return pairs; // Only header
  
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

/**
 * Extract region from campaign name.
 * Adjust this logic to match your naming convention.
 * Default: if name contains " - ", take the part after the last " - "
 */
function extractRegion(campaignName) {
  // Handle pipe-delimited names like "Search | Viaduct | Property Management"
  if (campaignName.indexOf(' | ') !== -1) {
    var parts = campaignName.split(' | ');
    if (parts.length >= 2) return parts[1].trim();
  }
  // Fallback: dash-delimited "Campaign - Region"
  var dashParts = campaignName.split(' - ');
  if (dashParts.length > 1) return dashParts[dashParts.length - 1].trim();
  return 'Auckland';
}
