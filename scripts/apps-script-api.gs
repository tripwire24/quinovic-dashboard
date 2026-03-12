/**
 * Quinovic — Apps Script JSON API
 * 
 * Serves Google Sheet data as JSON via a web endpoint.
 * Bound to the "Quinovic — Google Ads Data" Google Sheet.
 * 
 * SETUP:
 * 1. Open the Google Sheet → Extensions → Apps Script
 * 2. Paste this code into Code.gs
 * 3. Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the deployment URL → paste into dashboard app.js
 * 
 * USAGE:
 *   GET {url}                          → last 30 days
 *   GET {url}?start=2025-10-01         → from date to today
 *   GET {url}?start=2025-10-01&end=2025-12-31  → specific range
 */

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var data = getData(params.start, params.end);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        generated: new Date().toISOString(),
        count: data.length,
        data: data
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Read and filter the data sheet
 */
function getData(startDateStr, endDateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Try 'data' tab first, fall back to first sheet
  var sheet = ss.getSheetByName('data') || ss.getSheets()[0];
  
  if (!sheet || sheet.getLastRow() <= 1) {
    return [];
  }
  
  // Calculate date boundaries
  var now = new Date();
  var endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : now;
  
  var startDate;
  if (startDateStr) {
    startDate = new Date(startDateStr + 'T00:00:00');
  } else {
    // Default: last 30 days
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
  }
  
  // Read all data (header in row 1)
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var results = [];
  
  for (var i = 0; i < allData.length; i++) {
    var row = allData[i];
    var rowDate = row[0];
    
    // Handle date column — could be Date object or string
    if (typeof rowDate === 'string') {
      rowDate = new Date(rowDate + 'T00:00:00');
    }
    
    // Filter by date range
    if (rowDate < startDate || rowDate > endDate) {
      continue;
    }
    
    // Build object from headers
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = camelCase(headers[j]);
      obj[key] = row[j];
      
      // Format date as string
      if (j === 0 && row[j] instanceof Date) {
        obj[key] = Utilities.formatDate(row[j], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    }
    
    results.push(obj);
  }
  
  return results;
}

/**
 * Convert header names to camelCase keys
 * "Avg CPC" → "avgCpc", "Search Impr Share" → "searchImprShare"
 */
function camelCase(str) {
  return str
    .replace(/[()]/g, '')
    .trim()
    .split(/[\s]+/)
    .map(function(word, i) {
      word = word.toLowerCase();
      if (i === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}
