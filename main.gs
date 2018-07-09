/*
  Client-wise exporter for Toggl track logs to multiple GoogleCalendars
  Copyright (c) 2018 Ryohei Suzuki
  Released under the MIT license
  https://github.com/quolc/toggl_exporter/blob/master/LICENSE
*/

/*
  ORIGINAL LICENSE

  Toggl track logs export to GoogleCalendar
  Copyright (c) 2017 Masato Kawaguchi
  Released under the MIT license
  https://github.com/mkawaguchi/toggl_exporter/blob/master/LICENSE
  required: moment.js
    project-key: MHMchiX6c1bwSqGM1PZiW_PxhMjh3Sh48
*/

var CACHE_KEY          = 'toggl_exporter:lastmodify_datetime';
var TIME_OFFSET        = 9 * 60 * 60; // JST
var TOGGL_API_HOST     = 'https://www.toggl.com/api/v8/time_entries';
var TOGGL_API_HOST_PROJECTS = 'https://www.toggl.com/api/v8/projects/';
var TOGGL_API_HOST_CLIENTS = 'https://www.toggl.com/api/v8/clients/';
var TOGGL_BASIC_AUTH   = 'REPLACE_ME:api_token';
var GOOGLE_CALENDAR_IDS = {
  'CLIENT_NAME1' : '******@group.calendar.google.com',
  'CLIENT_NAME2' : '******@group.calendar.google.com',
};

function getLastModifyDatetime() {
  var cache = {};
  var file = DriveApp.getFilesByName('toggl_exporter_cache');
  if(!file.hasNext()) {
    var now = Moment.moment().format('X');
    var beginning_of_day = parseInt(now - (now % 86400 + TIME_OFFSET), 10).toFixed();
    putLastModifyDatetime(beginning_of_day);
    return beginning_of_day;
  }
  file = file.next();
  var data = JSON.parse(file.getAs("application/octet-stream").getDataAsString());
  return parseInt(data[CACHE_KEY], 10).toFixed();
}

function putLastModifyDatetime(unix_timestamp) {
  var cache = {};
  cache[CACHE_KEY] = unix_timestamp;
  var file = DriveApp.getFilesByName('toggl_exporter_cache');
  if(!file.hasNext()) {
    DriveApp.createFile('toggl_exporter_cache', JSON.stringify(cache));
    return true;
  }
  file = file.next();
  file.setContent(JSON.stringify(cache));
  return true;
}

// time entries after the argument timestemp are returned
function getTimeEntries(unix_timestamp) {
  var uri = TOGGL_API_HOST;// + '?' + 'start_date=' + encodeURIComponent(Moment.moment(unix_timestamp, 'X').format());
  var response = UrlFetchApp.fetch(
    uri,
    {
      'method' : 'GET',
      'headers' : { "Authorization" : " Basic " + Utilities.base64Encode(TOGGL_BASIC_AUTH) },
      'muteHttpExceptions': true
    }
  );
  try {
    var entries = JSON.parse(response);
    var new_entries = [];
    for (var i=0; i<entries.length; i++) {
      var at = (parseInt(Moment.moment(entries[i].at).format('X'), 10)).toFixed();
      if (at > unix_timestamp) {
        new_entries.push(entries[i]);
      }
    }
    return new_entries;
  }
  catch (e) {
    Logger.log([unix_timestamp, e]);
  }
}

function getProject(pid) {
  var uri = TOGGL_API_HOST_PROJECTS + pid;
  var response = UrlFetchApp.fetch(
    uri,
    {
      'method' : 'GET',
      'headers' : { "Authorization" : " Basic " + Utilities.base64Encode(TOGGL_BASIC_AUTH) },
      'muteHttpExceptions': true
    }
  );
  try {
    return JSON.parse(response).data;
  }
  catch (e) {
    Logger.log([pid, e]);
  }
}

function getClient(cid) {
  var uri = TOGGL_API_HOST_CLIENTS + cid;
  var response = UrlFetchApp.fetch(
    uri,
    {
      'method' : 'GET',
      'headers' : { "Authorization" : " Basic " + Utilities.base64Encode(TOGGL_BASIC_AUTH) },
      'muteHttpExceptions': true
    }
  );
  try {
    return JSON.parse(response).data;
  }
  catch (e) {
    Logger.log([pid, e]);
  }
}

function recordActivityLog(project, client, description, started_at, ended_at) {
  try {
    var calendar = CalendarApp.getCalendarById(GOOGLE_CALENDAR_IDS[client]);
    calendar.setTimeZone('Asia/Tokyo');
    calendar.createEvent(
      project,
      new Date(started_at),
      new Date(ended_at),
      {'description' : description}
    );
  } catch (e) {
    Logger.log([client, e]);
  }
}

function watch() {
  try {
    var check_datetime = getLastModifyDatetime();
    var time_entries = getTimeEntries(check_datetime);
    var processed_count = 0;
    
    if (time_entries) {
      last_at_datetime = null;
      for (var i=0; i<time_entries.length; i++) {
        var record = time_entries[i];
        if (record.stop == null) continue; // skip running event
        var pid = record.pid;
        var project_info = getProject(pid);
        var client_info = getClient(project_info.cid);
        
        recordActivityLog(
          project_info.name,
          client_info.name,
          time_entries[i].description || "no description", 
          Moment.moment(record.start).format(),
          Moment.moment(record.stop).format()
          );
        var at = (parseInt(Moment.moment(record.at).format('X'), 10)).toFixed();
        if (at > last_at_datetime) {
          last_at_datetime = at;
        }
        processed_count++;
      }
      if (last_at_datetime) {
        putLastModifyDatetime(last_at_datetime);
      }
      Logger.log("processed " + processed_count + " entries.");
    }
  } catch (e) {
    Logger.log(e);
  }
}
