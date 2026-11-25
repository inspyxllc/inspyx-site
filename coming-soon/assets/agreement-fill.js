/* An agreement's blanks, filled on the website exactly as the phone and the server fill them (2026-11-24, Inspyx 4;
   his Spectora list item 10, "Agreements outdated"). The website's copy of the app's lib/src/data/agreement_blanks.dart
   and of the server's backend/supabase/functions/sign/fill.ts. ONE RULEBOOK: the app repo's
   test/fixtures/agreement_fill.json, copied to tools/agreement_fill.json and run by tools/check_fill.js here.

   It also says whether a signed agreement still holds: what each watched blank was filled with when it was sent (the
   signing's snapshot) against what it would be filled with today, as the phone's lib/src/data/agreement_outdated.dart.

   No words here: the page holds every sentence. Works in the browser (window.InspyxFill) and in Node (require). */
(function (root) {
  'use strict';

  var BLANKS = [
    ['clientName', 'Client name', true], ['propertyAddress', 'Property address', true],
    ['inspectionDate', 'Inspection date', true], ['fee', 'Fee', true], ['inspectorName', 'Your name', true],
    ['company', 'Your company', true], ['licenseNumber', 'License number', true], ['today', "Today's date", true],
    ['services', 'Services', false], ['feeLines', 'Services and fees', false],
    ['clientFirstName', "Client's first name", false], ['clientPhone', "Client's phone", false],
    ['clientEmail', "Client's email", false], ['street', 'Street', false], ['city', 'City', false],
    ['state', 'State', false], ['zip', 'ZIP code', false], ['companyPhone', 'Company phone', false],
    ['year', 'This year', false]
  ];
  var EMPTY_BLANK_LINE = '__________';

  /* Dart's String.trim: the same spaces, by one scan in from each end. */
  var DART_SPACE = {};
  [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
    0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff].forEach(function (c) { DART_SPACE[c] = true; });
  function dartTrim(s) {
    var start = 0, end = s.length;
    while (start < end && DART_SPACE[s.charCodeAt(start)]) start++;
    while (end > start && DART_SPACE[s.charCodeAt(end - 1)]) end--;
    return s.slice(start, end);
  }

  var tagOf = function (w) { return w.toUpperCase().replace(/['’]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''); };
  var plain = function (w) { return dartTrim(w.toLowerCase().replace(/’/g, "'").replace(/[\s ]+/g, ' ')); };
  var TAGS = {}, LABELS = {};
  BLANKS.forEach(function (b) { TAGS[tagOf(b[1])] = b[0]; if (b[2]) LABELS[plain(b[1])] = b[0]; });
  [['ADDRESS', 'propertyAddress'], ['STREET', 'street'], ['CITY', 'city'], ['STATE', 'state'], ['ZIP', 'zip'],
    ['CURRENT_DATE', 'today'], ['CURRENT_YEAR', 'year'], ['PRICE', 'fee'], ['FEES', 'feeLines'],
    ['SERVICES', 'services'], ['CLIENT_NAME', 'clientName'], ['CLIENT_FIRST_NAME', 'clientFirstName'],
    ['CLIENT_PHONE', 'clientPhone'], ['CLIENT_EMAIL', 'clientEmail'], ['INSPECTION_DATE', 'inspectionDate'],
    ['INSPECTOR_NAME', 'inspectorName'], ['INSPECTOR_CREDENTIALS', 'licenseNumber'],
    ['INSPECTION_COMPANY', 'company'], ['COMPANY_PHONE', 'companyPhone']].forEach(function (p) { TAGS[p[0]] = p[1]; });
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* The blanks in [text], in order; other words in square brackets are the inspector's own. */
  function findBlanks(text) {
    var found = [], re = /\{\{\s*([A-Za-z][A-Za-z0-9_ \-’']{0,48}?)\s*\}\}|\[\s*([^\[\]\r\n]{1,40}?)\s*\]/g, m;
    while ((m = re.exec(text)) !== null) {
      var start = m.index, end = start + m[0].length;
      if (m[1] !== undefined) { var t = tagOf(m[1]); found.push({ start: start, end: end, raw: m[0], blank: has(TAGS, t) ? TAGS[t] : null }); continue; }
      var l = plain(m[2]);
      if (has(LABELS, l)) found.push({ start: start, end: end, raw: m[0], blank: LABELS[l] });
    }
    return found;
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + (+m[1]) : '';
  }
  function agreementUsd(cents) {
    var abs = Math.abs(cents);
    var dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var rest = String(abs % 100); if (rest.length < 2) rest = '0' + rest;
    return (cents < 0 ? '-' : '') + '$' + dollars + '.' + rest;
  }
  var named = function (names) { return names.map(dartTrim).filter(function (n) { return n !== ''; }).map(function (n) { return n.replace(/\s+/g, ' '); }); };
  var joinAnd = function (p) { return p.length <= 1 ? p.join('') : p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1]; };
  function address(f) {
    if (dartTrim(f.street) === '') return '';
    var stateZip = [dartTrim(f.state), dartTrim(f.zip)].filter(function (s) { return s !== ''; }).join(' ');
    return [dartTrim(f.street), dartTrim(f.city), stateZip].filter(function (s) { return s !== ''; }).join(', ');
  }

  /* What goes into [blank]; '' when there's nothing for it. [f] as fill.ts's Facts (days as "YYYY-MM-DD"). */
  function valueOf(blank, f) {
    switch (blank) {
      case 'clientName': return joinAnd(named(f.clientNames));
      case 'clientFirstName': { var n = named(f.clientNames); return n.length === 0 ? '' : n[0].split(' ')[0]; }
      case 'clientPhone': return dartTrim(f.clientPhone);
      case 'clientEmail': return dartTrim(f.clientEmail);
      case 'propertyAddress': return address(f);
      case 'street': return dartTrim(f.street);
      case 'city': return dartTrim(f.city);
      case 'state': return dartTrim(f.state);
      case 'zip': return dartTrim(f.zip);
      case 'inspectionDate': return longDate(f.inspectionDate || f.today);
      case 'today': return longDate(f.today);
      case 'year': return (f.today || '').slice(0, 4);
      case 'fee': return f.feeCents === null || f.feeCents === undefined ? '' : agreementUsd(f.feeCents);
      case 'services': return named(f.services).join(', ');
      case 'feeLines': return f.feeLines.filter(function (l) { return dartTrim(l.name) !== ''; })
        .map(function (l) { return dartTrim(l.name) + ': ' + agreementUsd(l.cents); }).join('\n');
      case 'inspectorName': return dartTrim(f.inspectorName);
      case 'company': return dartTrim(f.company);
      case 'licenseNumber': return dartTrim(f.licenseNumber);
      case 'companyPhone': return dartTrim(f.companyPhone);
      default: return '';
    }
  }

  function fillAgreement(text, f) {
    var out = '', at = 0, empty = [], unknown = [];
    findBlanks(text).forEach(function (span) {
      out += text.slice(at, span.start); at = span.end;
      var value = span.blank === null ? '' : valueOf(span.blank, f);
      if (span.blank !== null && value === '' && empty.indexOf(span.blank) < 0) empty.push(span.blank);
      if (span.blank === null) { var w = '{{' + dartTrim(span.raw.slice(2, -2)) + '}}'; if (unknown.indexOf(w) < 0) unknown.push(w); }
      out += value === '' ? EMPTY_BLANK_LINE : value;
    });
    return { text: out + text.slice(at), empty: empty, unknown: unknown };
  }

  /* ---- Agreements outdated: the phone's agreement_outdated.dart ---- */

  /* The signing that stands for the booking: of the ones not void, one no update replaced first, then the newest sent
     (the server's signing_current_client). [signings]: the signings' data; [details]: signing_details' data by id. */
  function currentSigning(signings, details) {
    var best = null, bestOpen = false;
    signings.forEach(function (s) {
      if (s.status === 'void' || s.deletedAt != null) return;
      var d = details[s.id], open = !d || d.supersededBy == null;
      if (!best || (open && !bestOpen) || (open === bestOpen && s.sentAt > best.sentAt)) { best = s; bestOpen = open; }
    });
    return best;
  }

  /* Money exactly; words with case, commas and spaces aside. */
  var EXACT = { fee: true, feeLines: true };
  var loose = function (v) { return v.replace(/,/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase(); };
  var same = function (b, was, now) { return EXACT[b] ? was === now : loose(was) === loose(now); };

  /* Where [signings] stand against today's [facts]: {kind: 'holds'} | {kind: 'outdated', signing, changes:
     [{blank, was, now}] in the blanks' order} | {kind: 'updateSent', signing}. */
  function standing(signings, details, facts) {
    var cur = currentSigning(signings, details);
    if (!cur) return { kind: 'holds' };
    if (cur.status === 'sent' || cur.status === 'opened') {
      var isUpdate = signings.some(function (s) { return s.status === 'signed' && details[s.id] && details[s.id].supersededBy === cur.id; });
      return isUpdate ? { kind: 'updateSent', signing: cur } : { kind: 'holds' };
    }
    if (cur.status !== 'signed') return { kind: 'holds' };
    var filled = (details[cur.id] && details[cur.id].filled) || {};
    var changes = [];
    BLANKS.forEach(function (b) {
      if (!has(filled, b[0]) || typeof filled[b[0]] !== 'string') return;
      var now = valueOf(b[0], facts);
      if (!same(b[0], filled[b[0]], now)) changes.push({ blank: b[0], was: filled[b[0]], now: now });
    });
    return changes.length ? { kind: 'outdated', signing: cur, changes: changes } : { kind: 'holds' };
  }

  var api = { BLANKS: BLANKS, dartTrim: dartTrim, findBlanks: findBlanks, valueOf: valueOf, fillAgreement: fillAgreement,
    agreementUsd: agreementUsd, currentSigning: currentSigning, standing: standing };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InspyxFill = api;
})(typeof window !== 'undefined' ? window : this);
