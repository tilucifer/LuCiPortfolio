const SHEETS = {
  contacts: 'Contacts',
  shows: 'Spectacles',
  mailing: 'Listes emails'
};

const CONTACT_HEADERS = [
  'ID', 'Civilité', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Ville', 'Département',
  'Company', 'Spectacles vus', 'Spectacles programmés', 'Programme jeune public',
  'Programme adulte', 'Programme de rue', 'Commentaires', 'Note', 'Créé le', 'Modifié le'
];

const SHOW_HEADERS = ['ID', 'Nom du spectacle', 'Compagnie', 'Catégorie', 'Commentaires', 'Créé le', 'Modifié le'];
const MAILING_HEADERS = ['Nom de la liste', 'Créée le', 'email google'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('LuCiPortfolio')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getAppData() {
  try {
    getSpreadsheet_();
  } catch (error) {
    if (String(error.message).indexOf('Aucune feuille liée') === 0) {
      return { setupRequired: true, contacts: [], spectacles: [] };
    }
    throw error;
  }
  ensureSheets_();
  return {
    setupRequired: false,
    contacts: readRecords_(SHEETS.contacts, CONTACT_HEADERS).map(contactFromRow_),
    spectacles: readRecords_(SHEETS.shows, SHOW_HEADERS).map(showFromRow_)
  };
}

function connectSpreadsheet(spreadsheetIdOrUrl) {
  const input = clean_(spreadsheetIdOrUrl);
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = match ? match[1] : input;
  if (!id) throw new Error('Renseignez l’identifiant ou l’URL du Google Sheet.');
  const spreadsheet = SpreadsheetApp.openById(id);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  ensureSheets_();
  return { name: spreadsheet.getName() };
}

function saveContact(contact) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureSheets_();
    const record = contact || {};
    const id = clean_(record.id) || Utilities.getUuid();
    const existing = findRecord_(SHEETS.contacts, 'ID', id);
    const now = new Date();
    const values = {
      'ID': id,
      'Civilité': clean_(record.civilite),
      'Prénom': clean_(record.prenom),
      'Nom': clean_(record.nom),
      'Email': clean_(record.email),
      'Téléphone': clean_(record.telephone),
      'Ville': clean_(record.ville),
      'Département': clean_(record.departement),
      'Company': clean_(record.company),
      'Spectacles vus': JSON.stringify(stringArray_(record.spectaclesVus)),
      'Spectacles programmés': JSON.stringify(stringArray_(record.spectaclesProgrammes)),
      'Programme jeune public': record.jeunePublic ? 'Oui' : 'Non',
      'Programme adulte': record.adulte ? 'Oui' : 'Non',
      'Programme de rue': record.rue ? 'Oui' : 'Non',
      'Commentaires': clean_(record.commentaires),
      'Note': clean_(record.note),
      'Créé le': existing ? existing['Créé le'] : now,
      'Modifié le': now
    };
    writeRecord_(SHEETS.contacts, CONTACT_HEADERS, values, existing && existing._row);
    return contactFromRow_(values);
  } finally {
    lock.releaseLock();
  }
}

function saveSpectacle(spectacle) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureSheets_();
    const record = spectacle || {};
    const id = clean_(record.id) || Utilities.getUuid();
    const existing = findRecord_(SHEETS.shows, 'ID', id);
    const now = new Date();
    const values = {
      'ID': id,
      'Nom du spectacle': clean_(record.nom),
      'Compagnie': clean_(record.compagnie),
      'Catégorie': clean_(record.categorie),
      'Commentaires': clean_(record.commentaires),
      'Créé le': existing ? existing['Créé le'] : now,
      'Modifié le': now
    };
    writeRecord_(SHEETS.shows, SHOW_HEADERS, values, existing && existing._row);
    return showFromRow_(values);
  } finally {
    lock.releaseLock();
  }
}

function createEmailList(contactIds, listName) {
  ensureSheets_();
  const wanted = new Set(stringArray_(contactIds));
  if (!wanted.size) throw new Error('Sélectionnez au moins un contact.');
  const contacts = readRecords_(SHEETS.contacts, CONTACT_HEADERS).map(contactFromRow_);
  const seen = new Set();
  const emails = contacts
    .filter(function (contact) { return wanted.has(contact.id); })
    .map(function (contact) { return clean_(contact.email); })
    .filter(function (email) {
      const key = email.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!emails.length) throw new Error('Aucune adresse email valide dans la sélection.');

  const sheet = getSpreadsheet_().getSheetByName(SHEETS.mailing);
  const name = clean_(listName) || 'Liste du ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const created = new Date();
  sheet.getRange(sheet.getLastRow() + 1, 1, emails.length, 3)
    .setValues(emails.map(function (email) { return [name, created, email]; }));
  return { listName: name, count: emails.length, skipped: wanted.size - emails.length };
}

function importContacts(options) {
  const input = options || {};
  const spreadsheetId = clean_(input.spreadsheetId);
  const sheetName = clean_(input.sheetName);
  if (!spreadsheetId || !sheetName) throw new Error('Renseignez l’identifiant du Google Sheet et le nom de son onglet.');
  ensureSheets_();

  const source = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = source.getSheetByName(sheetName);
  if (!sourceSheet) throw new Error('Onglet introuvable : ' + sheetName);
  const rows = sourceSheet.getDataRange().getValues();
  if (!rows.length) return { created: 0, updated: 0, shows: 0, count: 0 };

  const hasHeader = input.hasHeader !== false;
  const dataStart = hasHeader ? 1 : 0;
  const headers = hasHeader ? rows[0].map(normalizeHeader_) : [];
  const aliases = {
    note: ['note'], company: ['company', 'compagnie', 'structure'], civilite: ['civilite', 'civilte'],
    prenom: ['prenom'], nom: ['nom'], commentaires: ['commentaires', 'commentaire'], email: ['email', 'courriel'],
    ville: ['ville'], departement: ['departement', 'department'], telephone: ['telephone', 'tel', 'portable'],
    spectacles: ['spectacle vus ou programme', 'spectacles vus ou programme', 'spectacle', 'spectacles vus', 'spectacles programmes', 'spectacles vus ou programmes']
  };
  const fallback = { note: 0, company: 1, civilite: 2, prenom: 3, nom: 4, commentaires: 5, email: 6, ville: 7, departement: 8, telephone: 9, spectacles: 10 };
  const columns = {};
  Object.keys(aliases).forEach(function (key) {
    columns[key] = -1;
    for (let i = 0; i < headers.length; i++) {
      if (aliases[key].some(function (alias) { return headers[i] === alias || (key === 'spectacles' && headers[i].indexOf(alias) >= 0); })) { columns[key] = i; break; }
    }
    if (columns[key] < 0) columns[key] = fallback[key];
  });

  const existing = readRecords_(SHEETS.contacts, CONTACT_HEADERS).map(contactFromRow_);
    const byEmail = {};
    existing.forEach(function (contact) { if (contact.email) byEmail[contact.email.toLowerCase()] = contact; });
    const showRecords = readRecords_(SHEETS.shows, SHOW_HEADERS).map(showFromRow_);
    const showByName = {};
    showRecords.forEach(function (show) { if (show.nom) showByName[show.nom.toLowerCase()] = show; });
    let createdCount = 0;
    let updatedCount = 0;
    let importedShowCount = 0;
    const mode = input.showMode === 'programmes' ? 'programmes' : 'vus';

    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r];
      if (row.every(function (value) { return value === '' || value === null; })) continue;
      const get = function (key) { const index = columns[key]; return index >= 0 ? clean_(row[index]) : ''; };
      const email = get('email');
      const previous = email ? byEmail[email.toLowerCase()] : null;
      const showNames = get('spectacles').split(',').map(function (item) { return item.trim(); }).filter(Boolean);
      const showIds = [];
      showNames.forEach(function (showName) {
        const key = showName.toLowerCase();
        let show = showByName[key];
        if (!show) {
          show = saveSpectacle({ nom: showName, compagnie: '', categorie: '', commentaires: '' });
          showByName[key] = show;
          importedShowCount++;
        }
        showIds.push(show.id);
      });
      const incoming = {
        id: previous ? previous.id : '',
        civilite: get('civilite') || (previous && previous.civilite) || '',
        prenom: get('prenom') || (previous && previous.prenom) || '',
        nom: get('nom') || (previous && previous.nom) || '',
        email: email || (previous && previous.email) || '',
        telephone: get('telephone') || (previous && previous.telephone) || '',
        ville: get('ville') || (previous && previous.ville) || '',
        departement: get('departement') || (previous && previous.departement) || '',
        company: get('company') || (previous && previous.company) || '',
        spectaclesVus: mode === 'vus' ? unique_(showIds.concat(previous ? previous.spectaclesVus : [])) : (previous ? previous.spectaclesVus : []),
        spectaclesProgrammes: mode === 'programmes' ? unique_(showIds.concat(previous ? previous.spectaclesProgrammes : [])) : (previous ? previous.spectaclesProgrammes : []),
        jeunePublic: previous ? previous.jeunePublic : false,
        adulte: previous ? previous.adulte : false,
        rue: previous ? previous.rue : false,
        commentaires: get('commentaires') || (previous && previous.commentaires) || '',
        note: get('note') || (previous && previous.note) || ''
      };
      const saved = saveContact(incoming);
      if (previous) updatedCount++; else createdCount++;
      if (email) byEmail[email.toLowerCase()] = saved;
    }
  return { created: createdCount, updated: updatedCount, shows: importedShowCount, count: createdCount + updatedCount };
}

function ensureSheets_() {
  ensureSheet_(SHEETS.contacts, CONTACT_HEADERS);
  ensureSheet_(SHEETS.shows, SHOW_HEADERS);
  ensureSheet_(SHEETS.mailing, MAILING_HEADERS);
}

function ensureSheet_(name, headers) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  headers.forEach(function (header) {
    if (current.indexOf(header) < 0) {
      current.push(header);
      sheet.getRange(1, current.length).setValue(header);
    }
  });
  sheet.setFrozenRows(1);
  return sheet;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Aucune feuille liée. Ouvrez ce projet Apps Script depuis Extensions → Apps Script dans le Google Sheet, ou définissez la propriété SPREADSHEET_ID.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  return spreadsheet;
}

function readRecords_(sheetName, headers) {
  const sheet = ensureSheet_(sheetName, headers);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const columns = {};
  values[0].forEach(function (header, index) { columns[String(header)] = index; });
  return values.slice(1).map(function (row, index) {
    const record = { _row: index + 2 };
    headers.forEach(function (header) { record[header] = columns[header] === undefined ? '' : row[columns[header]]; });
    return record;
  }).filter(function (record) {
    return headers.some(function (header) { return String(record[header] || '').trim() !== ''; });
  });
}

function findRecord_(sheetName, keyHeader, keyValue) {
  const records = readRecords_(sheetName, sheetName === SHEETS.contacts ? CONTACT_HEADERS : SHOW_HEADERS);
  for (let i = 0; i < records.length; i++) {
    if (String(records[i][keyHeader]) === String(keyValue)) return records[i];
  }
  return null;
}

function writeRecord_(sheetName, headers, values, rowNumber) {
  const sheet = ensureSheet_(sheetName, headers);
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const targetRow = rowNumber || sheet.getLastRow() + 1;
  const row = targetRow <= sheet.getLastRow()
    ? sheet.getRange(targetRow, 1, 1, headerRow.length).getValues()[0]
    : new Array(headerRow.length).fill('');
  headers.forEach(function (header) {
    const column = headerRow.indexOf(header) + 1;
    if (column > 0) row[column - 1] = values[header] === undefined ? '' : values[header];
  });
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
}

function contactFromRow_(row) {
  return {
    id: String(row['ID'] || ''), civilite: String(row['Civilité'] || ''), prenom: String(row['Prénom'] || ''),
    nom: String(row['Nom'] || ''), email: String(row['Email'] || ''), telephone: String(row['Téléphone'] || ''),
    ville: String(row['Ville'] || ''), departement: String(row['Département'] || ''), company: String(row['Company'] || ''),
    spectaclesVus: parseArray_(row['Spectacles vus']), spectaclesProgrammes: parseArray_(row['Spectacles programmés']),
    jeunePublic: isTrue_(row['Programme jeune public']), adulte: isTrue_(row['Programme adulte']), rue: isTrue_(row['Programme de rue']),
    commentaires: String(row['Commentaires'] || ''), note: String(row['Note'] || '')
  };
}

function showFromRow_(row) {
  return {
    id: String(row['ID'] || ''), nom: String(row['Nom du spectacle'] || ''), compagnie: String(row['Compagnie'] || ''),
    categorie: String(row['Catégorie'] || ''), commentaires: String(row['Commentaires'] || '')
  };
}

function parseArray_(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch (error) {}
  return String(value).split(',').map(function (part) { return part.trim(); }).filter(Boolean);
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function clean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function stringArray_(value) {
  return Array.isArray(value) ? value.map(clean_).filter(Boolean) : [];
}

function unique_(values) {
  return Array.from(new Set(values));
}

function isTrue_(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'oui' || normalized === 'true' || normalized === '1' || normalized === 'yes';
}
