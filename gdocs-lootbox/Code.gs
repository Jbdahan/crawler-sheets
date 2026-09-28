/**
 * Crawler Sheets: Loot Box generator for Google Docs.
 * Adds Extensions → <project name> → Open generator, a sidebar that writes an
 * achievement + loot box block into the Doc. Lists live in Data.gs.
 */

function onOpen() {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Open generator', 'showSidebar')
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Loot Box');
  DocumentApp.getUi().showSidebar(html);
}

function getLootData() {
  return LOOT_DATA;
}

/**
 * box = {
 *   name, description, reward,
 *   image: null | {kind: 'upload', data, mimeType, width} | {kind: 'url', url, width},
 *   lines: [{head, text}]
 * }
 * Returns {warning} when the picture couldn't be added (the rest still goes in).
 */
function insertLootBox(box) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var idx = insertionIndex_(doc, body);
  var warning = '';

  var plain = {};
  plain[DocumentApp.Attribute.BOLD] = false;
  plain[DocumentApp.Attribute.ITALIC] = false;
  plain[DocumentApp.Attribute.FONT_SIZE] = 11;
  plain[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.LEFT;

  function para(text, attrs) {
    var p = body.insertParagraph(idx++, text || '');
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    p.setAttributes(plain);
    if (attrs) p.setAttributes(attrs);
    return p;
  }

  var title = para('New Achievement!');
  title.editAsText().setBold(true).setFontSize(14);

  if (box.name) para(box.name).editAsText().setBold(true).setFontSize(16);
  if (box.description) para(box.description).editAsText().setItalic(true);

  if (box.reward) {
    var reward = para('Reward: ' + box.reward);
    reward.editAsText().setBold(0, 6, true);
  }

  if (box.image) {
    try {
      var blob = box.image.kind === 'upload'
        ? Utilities.newBlob(Utilities.base64Decode(box.image.data), box.image.mimeType, 'loot-box')
        : UrlFetchApp.fetch(box.image.url).getBlob();
      var imgPara = para('');
      imgPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      var img = imgPara.appendInlineImage(blob);
      var w = Number(box.image.width) || 250;
      var ratio = img.getHeight() / img.getWidth();
      img.setWidth(w).setHeight(Math.round(w * ratio));
    } catch (e) {
      warning = 'The picture could not be added (' + e.message + '). Everything else was inserted.';
    }
  }

  var lines = box.lines || [];
  if (lines.length) {
    para('Contents:').editAsText().setBold(true);
    lines.forEach(function (line) {
      var head = line.head || '';
      var li = body.insertListItem(idx++, head + (line.text || ''));
      li.setAttributes(plain);
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      if (head) li.editAsText().setBold(0, head.length - 1, true);
    });
  }

  para('');
  return { warning: warning };
}

/** Body index just after the cursor/selection, or the end of the Doc. */
function insertionIndex_(doc, body) {
  var el = null;
  var cursor = doc.getCursor();
  if (cursor) {
    el = cursor.getElement();
  } else {
    var sel = doc.getSelection();
    if (sel) {
      var ranges = sel.getRangeElements();
      if (ranges.length) el = ranges[ranges.length - 1].getElement();
    }
  }
  while (el && el.getParent() && el.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
    el = el.getParent();
  }
  if (el && el.getParent()) return body.getChildIndex(el) + 1;
  return body.getNumChildren();
}
