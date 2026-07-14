import ExcelJS from "exceljs";

// Palette reprise du modèle menu_semaine5.xlsx
const NAVY = "FF2E5090", NAVY2 = "FF1A3A6A", GOLD = "FF8B6914";
const SUBFILL = "FFEEF2FA", MACROFILL = "FFF0F4FA", WKND = "FFFDF5E0", WHITE = "FFFFFFFF";
const INK = "FF1A1A1A", GRAY = "FF555555";
const C_CAL = "FFD85A30", C_PRO = "FF1D9E75", C_LIP = "FFBA7517", C_GLU = "FF378ADD";
const SECTION_FILL = { "Petit-déjeuner": "FFFEF0D8", "Déjeuner": "FFDFF4EC", "Collation": "FFFFF0DC", "Dîner": "FFE4EEFA" };
const HEADER3 = "FFD6E4F0", ZEBRA = "FFF7F9FC", QTYBLUE = "FF1A5FA8", REMARK = "FF777777", LEGEND = "FFDCF5E8", LEGENDTXT = "FF0A5C3A";
const ARIAL = "Arial";
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const colLetter = (n) => String.fromCharCode(64 + n);

export async function buildMealPlanWorkbook(p) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SOMMET"; wb.created = new Date();

  /* ============================ FEUILLE MENU ============================ */
  const days = p.days;
  const nCols = 1 + days.length;
  const last = colLetter(nCols);
  const ms = wb.addWorksheet(`Menu ${p.weekShort}`, {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  ms.getColumn(1).width = 15;
  for (let i = 0; i < days.length; i++) ms.getColumn(2 + i).width = 21;

  // Titre
  ms.mergeCells(`A1:${last}1`);
  const t = ms.getCell("A1");
  t.value = p.menuTitle;
  t.font = { name: ARIAL, size: 14, bold: true, color: { argb: WHITE } };
  t.fill = fill(NAVY); t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ms.getRow(1).height = 28;
  // Sous-titre
  ms.mergeCells(`A2:${last}2`);
  const st = ms.getCell("A2");
  st.value = p.menuSubtitle;
  st.font = { name: ARIAL, size: 9, italic: true, color: { argb: GRAY } };
  st.fill = fill(SUBFILL); st.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ms.getRow(2).height = 16;
  // En-têtes jours (ligne 3)
  ms.getCell("A3").value = "";
  ms.getCell("A3").fill = fill(MACROFILL);
  days.forEach((d, i) => {
    const cell = ms.getCell(3, 2 + i);
    cell.value = d.day + (d.weekend ? "  🌴" : "");
    cell.font = { name: ARIAL, bold: true, color: { argb: WHITE } };
    cell.fill = fill(d.weekend ? GOLD : NAVY2);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ms.getRow(3).height = 20;
  // Lignes macros (4..7)
  const macros = [
    { label: "Calories", key: "kcal", suffix: " kcal", color: C_CAL },
    { label: "Protéines", key: "p", suffix: " g", color: C_PRO },
    { label: "Lipides", key: "f", suffix: " g", color: C_LIP },
    { label: "Glucides", key: "c", suffix: " g", color: C_GLU },
  ];
  macros.forEach((m, ri) => {
    const r = 4 + ri;
    const la = ms.getCell(r, 1);
    la.value = m.label;
    la.font = { name: ARIAL, size: 9, bold: true, color: { argb: m.color } };
    la.fill = fill(MACROFILL); la.alignment = { horizontal: "right", vertical: "middle" };
    days.forEach((d, i) => {
      const cell = ms.getCell(r, 2 + i);
      cell.value = (m.key === "kcal" ? d.total.kcal : d.total[m.key]) + m.suffix;
      cell.font = { name: ARIAL, size: 9, bold: true, color: { argb: m.color } };
      cell.fill = fill(d.weekend ? WKND : MACROFILL);
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    ms.getRow(r).height = 17;
  });

  // Sections repas
  let r = 8;
  const order = ["Petit-déjeuner", "Déjeuner", "Collation", "Dîner"];
  const icon = { "Petit-déjeuner": "🌅", "Déjeuner": "🥗", "Collation": "🍎", "Dîner": "🌙" };
  order.forEach((slot) => {
    // ligne d'en-tête de section (fusionnée)
    ms.mergeCells(`A${r}:${last}${r}`);
    const h = ms.getCell(`A${r}`);
    const avg = p.sectionAvg && p.sectionAvg[slot];
    h.value = `${icon[slot]} ${slot.toUpperCase()}${avg ? `   —   ~${avg.kcal} kcal · ${avg.p}g P · ${avg.c}g G · ${avg.f}g L` : ""}`;
    h.font = { name: ARIAL, size: 10, bold: true, color: { argb: INK } };
    h.fill = fill(SECTION_FILL[slot] || "FFEEEEEE");
    h.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    ms.getRow(r).height = 19;
    r++;
    // ligne de contenu : une cellule par jour (nom en gras + ingrédients)
    let maxLines = 1;
    days.forEach((d, i) => {
      const meal = d.meals.find((x) => x.slot === slot);
      const cell = ms.getCell(r, 2 + i);
      if (meal) {
        const lines = 1 + meal.items.length;
        maxLines = Math.max(maxLines, lines);
        cell.value = { richText: [
          { text: meal.name + "\n", font: { name: ARIAL, size: 9, bold: true, color: { argb: INK } } },
          { text: meal.items.join("\n"), font: { name: ARIAL, size: 9, color: { argb: INK } } },
        ] };
      }
      cell.fill = fill(d.weekend ? WKND : WHITE);
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    });
    ms.getCell(r, 1).fill = fill(WHITE);
    ms.getRow(r).height = Math.min(160, 14 * maxLines + 8);
    r++;
  });
  // Légende
  ms.mergeCells(`A${r}:${last}${r}`);
  const lg = ms.getCell(`A${r}`);
  lg.value = p.menuLegend || "★ Choix « bons gras » / Berthou   |   Macros par repas = estimations   |   ×N = portions ajustées (liste de courses)";
  lg.font = { name: ARIAL, size: 9, italic: true, color: { argb: LEGENDTXT } };
  lg.fill = fill(LEGEND); lg.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ms.getRow(r).height = 18;

  /* =========================== FEUILLE COURSES ========================== */
  const cs = wb.addWorksheet(`Courses ${p.weekShort}`, {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  cs.getColumn(1).width = 34; cs.getColumn(2).width = 20; cs.getColumn(3).width = 28;
  cs.mergeCells("A1:C1");
  const ct = cs.getCell("A1");
  ct.value = p.coursesTitle;
  ct.font = { name: ARIAL, size: 13, bold: true, color: { argb: WHITE } };
  ct.fill = fill(NAVY); ct.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cs.getRow(1).height = 25;
  cs.mergeCells("A2:C2");
  const cst = cs.getCell("A2");
  cst.value = p.coursesSubtitle;
  cst.font = { name: ARIAL, size: 9, italic: true, color: { argb: GRAY } };
  cst.fill = fill(SUBFILL); cst.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cs.getRow(2).height = 14;

  let cr = 3;
  p.courses.forEach((grp) => {
    // bandeau catégorie
    cs.mergeCells(`A${cr}:C${cr}`);
    const g = cs.getCell(`A${cr}`);
    g.value = grp.label;
    g.font = { name: ARIAL, size: 10, bold: true, color: { argb: WHITE } };
    g.fill = fill(NAVY); g.alignment = { horizontal: "left", vertical: "middle" };
    cs.getRow(cr).height = 19; cr++;
    // en-tête colonnes
    ["Article", "Quantité", "Remarque"].forEach((txt, i) => {
      const cell = cs.getCell(cr, 1 + i);
      cell.value = txt;
      cell.font = { name: ARIAL, size: 9, bold: true, color: { argb: INK } };
      cell.fill = fill(HEADER3);
      cell.alignment = { horizontal: i === 1 ? "center" : "left", vertical: "middle" };
    });
    cs.getRow(cr).height = 16; cr++;
    // articles (zébrage)
    grp.items.forEach((it, idx) => {
      const z = idx % 2 === 1 ? ZEBRA : WHITE;
      const a = cs.getCell(cr, 1); a.value = it.article;
      a.font = { name: ARIAL, size: 9, color: { argb: INK } }; a.fill = fill(z); a.alignment = { horizontal: "left", vertical: "middle" };
      const b = cs.getCell(cr, 2); b.value = it.qty;
      b.font = { name: ARIAL, size: 9, bold: true, color: { argb: QTYBLUE } }; b.fill = fill(z); b.alignment = { horizontal: "center", vertical: "middle" };
      const c = cs.getCell(cr, 3); c.value = it.remark || "";
      c.font = { name: ARIAL, size: 8, italic: true, color: { argb: REMARK } }; c.fill = fill(z); c.alignment = { horizontal: "left", vertical: "middle" };
      cs.getRow(cr).height = 15; cr++;
    });
    // séparateur
    cs.getRow(cr).height = 6; cr++;
  });

  return await wb.xlsx.writeBuffer();
}
