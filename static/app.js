/* Knowledge Brain frontend. */
(function () {
  "use strict";

  // ------------------------------------------------------------- state

  const state = {
    thoughts: [],
    edges: [],
    selected: [],        // cytoscape element ids currently selected
    selectedThought: null,
    chatHistory: [],      // messages sent to DeepSeek within this page session
    chatInFlight: false,
    settings: null,
    suggestion: null,     // { parent_id, parent_title, reason } from /api/chat/suggest-link
    pendingQuestionType: null, // follow-up question type when saving (scientific, etc.)
    lastPrompt: "",
    viewMode: "outline",  // "graph" | "outline"
    outlineExpanded: null, // Set of expanded thought ids, or null for all-expanded
  };

  // ------------------------------------------------------------- i18n

  // UI strings keyed by semantic id. "en" is the fallback; "ro" is shown when
  // the user sets Language → Română in Settings.
  const I18N = {
    en: {
      "toolbar.newThought": "＋ New thought",
      "toolbar.newThoughtTitle": "Create a new root thought",
      "toolbar.link": "Link parent→child",
      "toolbar.linkTitle": "Create parent → child link between two selected thoughts",
      "toolbar.linkHint": "Link “{a}” → “{b}”?",
      "toolbar.viewGraph": "Graph",
      "toolbar.viewOutline": "Outline",
      "toolbar.viewTitle": "Switch between graph and outline view",
      "toolbar.connections": "🔍 Find connections",
      "toolbar.connectionsTitle": "Ask AI to find new links between your thoughts",
      "toolbar.translateTitles": "🌐 Translate titles",
      "toolbar.translateTitlesTitle": "Translate all untranslated titles to Romanian",
      "toolbar.translateContent": "🌐 Translate content",
      "toolbar.translateContentTitle": "Translate all thought details to Romanian",
      "toolbar.layout": "Layout",
      "toolbar.layoutOrganic": "Organic",
      "toolbar.layoutHierarchy": "Hierarchy",
      "toolbar.layoutConcentric": "Concentric",
      "toolbar.layoutCascading": "Cascading",
      "toolbar.searchPh": "Search…",
      "toolbar.searchModeTitle": "Search mode",
      "toolbar.searchExact": "Exact",
      "toolbar.searchAi": "AI",
      "toolbar.kb": "KB",
      "toolbar.kbTitle": "Active knowledge base",
      "toolbar.kbNew": "＋ New",
      "toolbar.kbNewTitle": "Create a new knowledge base",
      "toolbar.kbRename": "Rename",
      "toolbar.kbRenameTitle": "Rename the current knowledge base",
      "toolbar.kbDelete": "Delete",
      "toolbar.kbDeleteTitle": "Delete a knowledge base",
      "toolbar.export": "Export",
      "toolbar.exportTitle": "Download knowledge base as JSON",
      "toolbar.import": "Import",
      "toolbar.importTitle": "Load a knowledge base from JSON",
      "toolbar.stats": "📊 Stats",
      "toolbar.statsTitle": "Knowledge base statistics",
      "toolbar.settings": "Settings",
      "toolbar.settingsTitle": "DeepSeek settings",
      "chat.title": "DeepSeek Chat",
      "chat.statusTitle": "connection",
      "chat.contextTitle": "Include the selected thought as context in your prompt",
      "chat.useContext": "Use selected thought as context",
      "chat.contextPrefix": "Context: ",
      "chat.saveResponse": "Save response",
      "chat.saveChild": "as child of selection",
      "chat.saveSibling": "as sibling of selection",
      "chat.saveRoot": "as a new root",
      "chat.saveAsThought": "Save as thought",
      "chat.savePromptTitle": "Save your prompt as a thought",
      "chat.savePrompt": "Save prompt as thought",
      "chat.send": "Send",
      "chat.save": "Save",
      "chat.promptPh": "Ask DeepSeek… (Enter to send, Shift+Enter for newline)",
      "chat.exportMd": "Export chat as .md",
      "chat.exportMdTitle": "Download the chat as a Markdown file",
      "chat.exportEmpty": "Nothing to export yet — ask DeepSeek something first.",
      "chat.exportDone": "✓ Chat exported as Markdown",
      "graph.empty": "Your knowledge graph is empty.",
      "graph.firstThought": "Create your first thought",
      "outline.empty": "No thoughts yet.",
      "detail.empty": "Select a thought to view and edit it. Ctrl-click a second thought to create a parent → child link.",
      "detail.addChild": "＋ Add child",
      "detail.addSibling": "＋ Add sibling",
      "detail.extract": "✨ Extract ideas",
      "detail.extractTitle": "Use AI to extract ideas from this thought's content as child thoughts",
      "detail.generate": "✨ Generate related",
      "detail.generateTitle": "Generate related thoughts (children, siblings, or parents)",
      "detail.improveTitle": "✨ Improve title",
      "detail.improveTitleTitle": "Ask AI to suggest a cleaner title for this thought",
      "detail.genContent": "✨ Generate content",
      "detail.genContentTitle": "Generate content for this thought",
      "detail.reanalyze": "🔗 Reanalyze children",
      "detail.reanalyzeTitle": "Check whether this thought's children fit, and suggest new ones",
      "detail.edit": "Edit",
      "detail.delete": "Delete",
      "detail.parents": "Parents",
      "detail.children": "Children",
      "detail.siblings": "Siblings",
      "detail.backlinks": "Backlinks",
      "detail.backlinksHint": "Thoughts that mention this one in their content",
      "detail.noBacklinks": "No backlinks — nothing mentions this thought.",
      "detail.comments": "Comments",
      "detail.noParent": "No parents (root thought)",
      "detail.noChildren": "No children yet",
      "detail.noSiblings": "No siblings",
      "detail.noContent": "(no content)",
      "detail.copyTitle": "Copy thought name",
      "detail.copyContent": "Copy thought content",
      "detail.noComments": "No comments yet.",
      "detail.commentPh": "Add a comment…",
      "detail.addComment": "Add",
      "detail.qBadge": "Q: ",
      "detail.created": "Created ",
      "detail.updated": " · Updated ",
      "btn.cancel": "Cancel",
      "btn.save": "Save",
      "btn.close": "Close",
      "btn.addSelected": "Add selected",
      "btn.delete": "Delete",
      "btn.doneApplied": "Done — all applied",
      "btn.regenerate": "Regenerate",
      "btn.useContent": "Use this content",
      "btn.thinking": "Thinking…",
      "btn.searching": "Searching…",
      "btn.extracting": "Extracting…",
      "btn.generating": "Generating…",
      "btn.regenerating": "Regenerating…",
      "btn.analyzing": "Analyzing…",
      "btn.translating": "Translating…",
      "btn.apply": "Apply",
      "btn.skip": "Skip",
      "btn.done": "Done",
      "btn.doneMark": "✓ done",
      "search.note": "Searching…",
      "search.aiNote": "AI searching…",
      "search.noResults": "No results found.",
      "search.count": "{n} result{s}",
      "stats.title": "Statistics",
      "stats.total": "Total thoughts: ",
      "stats.sectionThought": "Thought types",
      "stats.sectionQuestion": "Follow-up question types",
      "stats.noThoughts": "No thoughts yet.",
      "followups.hint": "Follow-up questions…",
      "src.prompt": "Prompt",
      "src.generated": "Generated",
      "src.extract": "Extracted",
      "src.manual": "Manual",
      "src.unknown": "Unknown",
      "src.promptDesc": "Saved to the knowledge base from a chat prompt.",
      "src.generatedDesc": "Created by the AI — e.g. Generate related, Extract ideas.",
      "src.extractDesc": "Key ideas pulled out of a thought's content.",
      "src.manualDesc": "Created by hand, straight from the toolbar.",
      "qtype.scientific": "Scientific",
      "qtype.practical": "Practical",
      "qtype.comparative": "Comparative",
      "qtype.historical": "Historical",
      "qtype.causal": "Causal",
      "qtype.critical": "Critical",
      "qtype.untyped": "Untyped",
      "qtype.scientificDesc": "Explores the topic deeper and conceptually.",
      "qtype.practicalDesc": "Simple, everyday and actionable real-life application.",
      "qtype.comparativeDesc": "Compares this thought with related or opposite concepts.",
      "qtype.historicalDesc": "Asks how this idea evolved and what influenced it over time.",
      "qtype.causalDesc": "Asks what causes this and what its consequences are.",
      "qtype.criticalDesc": "Raises the strongest objections, counterarguments, or weaknesses.",
      "qtype.untypedDesc": "Thoughts not saved from a follow-up question.",
      "modal.statistics": "Statistics",
      "modal.settings": "Settings",
      "modal.newThought": "New thought",
      "modal.newChildOf": "New child of “{title}”",
      "btn.create": "Create",
      "modal.chooseTitle": "Choose a title",
      "modal.improveTitle": "Improve title",
      "modal.confirm": "Confirm",
      "modal.generatedContent": "Generated content for “",
      "modal.generatedRelated": "Generated ",
      "modal.reanalyze": "Reanalyze “",
      "modal.newConnections": "New connections",
      "modal.extractedIdeas": "Extracted ideas from “",
      "modal.editThought": "Edit thought",
      "modal.editThoughtRo": "Edit thought (Română)",
      "kb.name": "Name",
      "kb.new": "New",
      "kb.rename": "Rename",
      "kb.delete": "Delete",
      "kb.confirm": "Confirm",
      "kb.typeToConfirm": "Type the name to confirm",
      "kb.deleting": "Deleting",
      "kb.clearConfirm": "This will permanently delete ALL thoughts, links, and comments in “{name}”.",
      "kb.newTitle": "New knowledge base",
      "kb.renameTitle": "Rename knowledge base",
      "kb.deleteConfirm": "Deleting “{name}” will permanently remove it.",
      "settings.apiKey": "DeepSeek API key",
      "settings.keyConfigured": "✓ A key is configured.",
      "settings.getKey": "Get one at platform.deepseek.com",
      "settings.model": "Model",
      "settings.temperature": "Temperature",
      "settings.baseUrl": "Base URL",
      "settings.thinking": "Thinking mode (chain of thought)",
      "settings.language": "Language",
      "settings.dangerZone": "Danger zone",
      "settings.clearKb": "Clear this knowledge base",
      "settings.clearKbHint": "Deletes all thoughts in the current knowledge base and starts fresh.",
      "confirm.deleteCascade": "Delete “{title}” and all its descendants? This cannot be undone.",
      "confirm.delete": "Delete “{title}”? This cannot be undone.",
      "toast.alreadyExists": "“{title}” already exists — selected it.",
      "toast.dupTitle": "A thought with this title already exists — not saving a duplicate.",
      "pick.autoReason": "Auto title (first line)",
      "pick.originalReason": "Original question",
      "pick.aiBadge": "AI",
      "pick.autoBadge": "Auto",
      "pick.hint": "Pick a title for the new thought, or keep the auto one.",
      "toast.savedAs": "✓ Saved as thought #{id}",
      "toast.suggesting": "✨ Suggesting where to link…",
      "toast.suggestion": "✨ AI suggestion: {parent}",
      "toast.saveUnder": "Save under “{parent}”",
      "toast.saveAsRoot": "Save as root thought",
      "toast.suggestsUnder": "AI suggests linking under “{parent}” — {reason}",
      "toast.suggestsRoot": "AI suggests a new root thought — {reason}",
      "toast.noIdeas": "No ideas were extracted from this thought.",
      "toast.selectIdea": "Select at least one idea.",
      "toast.selectIdeaHint": "Select the ideas to add as child thoughts.",
      "toast.addedSkipped": ", skipped {n} already existing",
      "toast.noRelated": "No new related thoughts found.",
      "toast.selectThought": "Select at least one thought.",
      "toast.addedThought": "Added {n} thought{s}",
      "toast.addedChild": "Added {n} child thought{s}",
      "toast.noTitleSuggestions": "No title suggestions returned.",
      "pick.currentTitle": "Current title:",
      "btn.keepOriginal": "Keep original",
      "toast.titleUpdated": "Title updated to “{title}”",
      "toast.noConnections": "No new connections found.",
      "toast.linked": "Linked “{child}” under “{parent}”",
      "toast.kbCleared": "Knowledge base cleared",
      "toast.contentUpdated": "Content updated",
      "toast.translatedTitle": "Translated {n} title{s}",
      "toast.translatedDetail": "Translated {n} detail{s}",
      "toast.allTranslated": "All titles already translated",
      "toast.allDetailsTranslated": "All details already translated",
      "toast.switched": "Switched to “{name}”",
      "toast.created": "Created “{name}”",
      "toast.renamed": "Renamed to “{name}”",
      "toast.deleted": "Deleted",
      "toast.applyAll": "Apply all",
      "toast.addAsChild": "Add “{title}” as a child",
      "toast.linkUnder": "Link “{title}” under “{parent}”",
      "toast.moveUnder": "Move “{child}” under “{parent}”",
      "toast.updated": "Updated",
      "toast.copied": "✓ Copied",
      "chat.copyAnswer": "Copy this answer",
      "prompt.title": "Title",
      "prompt.content": "Content",
      "prompt.savePrompt": "Save prompt as thought",
      "conn.find": "Find connections",
      "conn.empty": "No thoughts to connect",
      "conn.new": "New connections",
      "conn.foundHint": "The AI found {n} relationship{s} between your thoughts. Apply the ones that make sense.",
      "conn.linkedMark": "✓ linked",
      "import.confirm": "Import will replace your entire knowledge base. Continue?",
      "import.failed": "Import failed",
      "rel.children": "Child thoughts",
      "rel.childrenHint": "Subtopics / ideas that expand this thought",
      "rel.siblings": "Sibling thoughts",
      "rel.siblingsHint": "Related thoughts under the same parent",
      "rel.siblingsNoParent": "No parent — this thought has no siblings",
      "rel.parents": "Parent thought(s)",
      "rel.parentsHint": "Broader concepts this thought belongs under",
      "rel.childrenShort": "children",
      "rel.siblingsShort": "siblings",
      "rel.parentsShort": "parents",
      "rel.selectHint": "Select the thoughts to add to your knowledge base.",
      "rel.modalTitle": "Generate related for “{title}”",
      "re.misplaced": "Misplaced children",
      "re.misplacedNone": "None — all children fit here.",
      "re.suggested": "Suggested new children",
      "re.none": "None.",
    },
    ro: {
      "toolbar.newThought": "＋ Gând nou",
      "toolbar.newThoughtTitle": "Creează un gând rădăcină nou",
      "toolbar.link": "Leagă părinte→copil",
      "toolbar.linkTitle": "Creează o legătură părinte → copil între două gânduri selectate",
      "toolbar.linkHint": "Legi „{a}” → „{b}”?",
      "toolbar.viewGraph": "Graf",
      "toolbar.viewOutline": "Contur",
      "toolbar.viewTitle": "Comută între vizualizarea grafic și contur",
      "toolbar.connections": "🔍 Găsește conexiuni",
      "toolbar.connectionsTitle": "Cere AI-ului să găsească legături noi între gândurile tale",
      "toolbar.translateTitles": "🌐 Tradu titlurile",
      "toolbar.translateTitlesTitle": "Tradu toate titlurile netraduse în română",
      "toolbar.translateContent": "🌐 Tradu conținutul",
      "toolbar.translateContentTitle": "Tradu detaliile tuturor gândurilor în română",
      "toolbar.layout": "Aspect",
      "toolbar.layoutOrganic": "Organic",
      "toolbar.layoutHierarchy": "Ierarhie",
      "toolbar.layoutConcentric": "Concentric",
      "toolbar.layoutCascading": "Cascadă",
      "toolbar.searchPh": "Caută…",
      "toolbar.searchModeTitle": "Mod de căutare",
      "toolbar.searchExact": "Exact",
      "toolbar.searchAi": "AI",
      "toolbar.kb": "Bază",
      "toolbar.kbTitle": "Bază de cunoștințe activă",
      "toolbar.kbNew": "＋ Nouă",
      "toolbar.kbNewTitle": "Creează o bază de cunoștințe nouă",
      "toolbar.kbRename": "Redenumește",
      "toolbar.kbRenameTitle": "Redenumește baza de cunoștințe curentă",
      "toolbar.kbDelete": "Șterge",
      "toolbar.kbDeleteTitle": "Șterge o bază de cunoștințe",
      "toolbar.export": "Exportă",
      "toolbar.exportTitle": "Descarcă baza de cunoștințe ca JSON",
      "toolbar.import": "Importă",
      "toolbar.importTitle": "Încarcă o bază de cunoștințe din JSON",
      "toolbar.stats": "📊 Statistici",
      "toolbar.statsTitle": "Statistici ale bazei de cunoștințe",
      "toolbar.settings": "Setări",
      "toolbar.settingsTitle": "Setări DeepSeek",
      "chat.title": "Chat DeepSeek",
      "chat.statusTitle": "conexiune",
      "chat.contextTitle": "Include gândul selectat ca context în promptul tău",
      "chat.useContext": "Folosește gândul selectat ca context",
      "chat.contextPrefix": "Context: ",
      "chat.saveResponse": "Salvează răspunsul",
      "chat.saveChild": "ca copil al selecției",
      "chat.saveSibling": "ca frate al selecției",
      "chat.saveRoot": "ca gând rădăcină nou",
      "chat.saveAsThought": "Salvează ca gând",
      "chat.savePromptTitle": "Salvează promptul tău ca gând",
      "chat.savePrompt": "Salvează promptul ca gând",
      "chat.send": "Trimite",
      "chat.save": "Salvează",
      "chat.promptPh": "Întreabă DeepSeek… (Enter pentru trimitere, Shift+Enter pentru linie nouă)",
      "chat.exportMd": "Exportă chat-ul ca .md",
      "chat.exportMdTitle": "Descarcă chat-ul ca fișier Markdown",
      "chat.exportEmpty": "Nu e nimic de exportat încă — întreabă întâi DeepSeek.",
      "chat.exportDone": "✓ Chat exportat ca Markdown",
      "graph.empty": "Graficul tău de cunoștințe este gol.",
      "graph.firstThought": "Creează primul tău gând",
      "outline.empty": "Încă nu există gânduri.",
      "detail.empty": "Selectează un gând pentru a-l vizualiza și edita. Ctrl-click pe un al doilea gând pentru a crea o legătură părinte → copil.",
      "detail.addChild": "＋ Adaugă copil",
      "detail.addSibling": "＋ Adaugă frate",
      "detail.extract": "✨ Extrage idei",
      "detail.extractTitle": "Folosește AI pentru a extrage idei din conținutul acestui gând ca gânduri-copil",
      "detail.generate": "✨ Generează legate",
      "detail.generateTitle": "Generează gânduri legate (copii, frați sau părinți)",
      "detail.improveTitle": "✨ Îmbunătățește titlul",
      "detail.improveTitleTitle": "Cere AI-ului să sugereze un titlu mai clar pentru acest gând",
      "detail.genContent": "✨ Generează conținut",
      "detail.genContentTitle": "Generează conținut pentru acest gând",
      "detail.reanalyze": "🔗 Reanalizează copiii",
      "detail.reanalyzeTitle": "Verifică dacă copiii acestui gând se potrivesc și sugerează alții noi",
      "detail.edit": "Editează",
      "detail.delete": "Șterge",
      "detail.parents": "Părinți",
      "detail.children": "Copii",
      "detail.siblings": "Frați",
      "detail.backlinks": "Backlink-uri",
      "detail.backlinksHint": "Gânduri care îl menționează pe acesta în conținut",
      "detail.noBacklinks": "Fără backlink-uri — nimic nu menționează acest gând.",
      "detail.comments": "Comentarii",
      "detail.noParent": "Fără părinți (gând rădăcină)",
      "detail.noChildren": "Încă fără copii",
      "detail.noSiblings": "Fără frați",
      "detail.noContent": "(fără conținut)",
      "detail.copyTitle": "Copiază numele gândului",
      "detail.copyContent": "Copiază conținutul gândului",
      "detail.noComments": "Încă nu există comentarii.",
      "detail.commentPh": "Adaugă un comentariu…",
      "detail.addComment": "Adaugă",
      "detail.qBadge": "Î: ",
      "detail.created": "Creat ",
      "detail.updated": " · Actualizat ",
      "btn.cancel": "Anulează",
      "btn.save": "Salvează",
      "btn.close": "Închide",
      "btn.addSelected": "Adaugă selectate",
      "btn.delete": "Șterge",
      "btn.doneApplied": "Gata — toate aplicate",
      "btn.regenerate": "Regenerează",
      "btn.useContent": "Folosește acest conținut",
      "btn.thinking": "Se gândește…",
      "btn.searching": "Se caută…",
      "btn.extracting": "Se extrage…",
      "btn.generating": "Se generează…",
      "btn.regenerating": "Se regenerează…",
      "btn.analyzing": "Se analizează…",
      "btn.translating": "Se traduce…",
      "btn.apply": "Aplică",
      "btn.skip": "Sari",
      "btn.done": "Gata",
      "btn.doneMark": "✓ gata",
      "search.note": "Se caută…",
      "search.aiNote": "Căutare AI…",
      "search.noResults": "Nu s-au găsit rezultate.",
      "search.count": "{n} rezultat{e}",
      "stats.title": "Statistici",
      "stats.total": "Total gânduri: ",
      "stats.sectionThought": "Tipuri de gânduri",
      "stats.sectionQuestion": "Tipuri de întrebări de follow-up",
      "stats.noThoughts": "Încă nu există gânduri.",
      "followups.hint": "Întrebări de follow-up…",
      "src.prompt": "Prompt",
      "src.generated": "Generat",
      "src.extract": "Extras",
      "src.manual": "Manual",
      "src.unknown": "Necunoscut",
      "src.promptDesc": "Salvat în baza de cunoștințe dintr-un prompt de chat.",
      "src.generatedDesc": "Creat de AI — de ex. Generează legate, Extrage idei.",
      "src.extractDesc": "Idei-cheie extrase din conținutul unui gând.",
      "src.manualDesc": "Creat manual, direct din bara de instrumente.",
      "qtype.scientific": "Științific",
      "qtype.practical": "Practic",
      "qtype.comparative": "Comparativ",
      "qtype.historical": "Istoric",
      "qtype.causal": "Cauzal",
      "qtype.critical": "Critic",
      "qtype.untyped": "Fără tip",
      "qtype.scientificDesc": "Explorează subiectul mai profund și conceptual.",
      "qtype.practicalDesc": "Aplicație simplă, de zi cu zi și acționabilă în viața reală.",
      "qtype.comparativeDesc": "Compară acest gând cu concepte legate sau opuse.",
      "qtype.historicalDesc": "Întreabă cum a evoluat această idee și ce a influențat-o de-a lungul timpului.",
      "qtype.causalDesc": "Întreabă ce cauzează aceasta și care sunt consecințele.",
      "qtype.criticalDesc": "Ridică cele mai puternice obiecții, contraargumente sau slăbiciuni.",
      "qtype.untypedDesc": "Gânduri care nu au fost salvate dintr-o întrebare de follow-up.",
      "modal.statistics": "Statistici",
      "modal.settings": "Setări",
      "modal.newThought": "Gând nou",
      "modal.newChildOf": "Copil nou al „{title}”",
      "btn.create": "Creează",
      "modal.chooseTitle": "Alege un titlu",
      "modal.improveTitle": "Îmbunătățește titlul",
      "modal.confirm": "Confirmă",
      "modal.generatedContent": "Conținut generat pentru „",
      "modal.generatedRelated": "Generat ",
      "modal.reanalyze": "Reanalizează „",
      "modal.newConnections": "Conexiuni noi",
      "modal.extractedIdeas": "Idei extrase din „",
      "modal.editThought": "Editează gândul",
      "modal.editThoughtRo": "Editează gândul (Română)",
      "kb.name": "Nume",
      "kb.new": "Nou",
      "kb.rename": "Redenumește",
      "kb.delete": "Șterge",
      "kb.confirm": "Confirmă",
      "kb.typeToConfirm": "Scrie numele pentru a confirma",
      "kb.deleting": "Ștergere",
      "kb.clearConfirm": "Aceasta va șterge permanent TOATE gândurile, legăturile și comentariile din „{name}”.",
      "kb.newTitle": "Bază de cunoștințe nouă",
      "kb.renameTitle": "Redenumește baza de cunoștințe",
      "kb.deleteConfirm": "Ștergerea „{name}” o va elimina permanent.",
      "settings.apiKey": "Cheie API DeepSeek",
      "settings.keyConfigured": "✓ O cheie este configurată.",
      "settings.getKey": "Obține una la platform.deepseek.com",
      "settings.model": "Model",
      "settings.temperature": "Temperatură",
      "settings.baseUrl": "URL de bază",
      "settings.thinking": "Mod de gândire (lanț de gândire)",
      "settings.language": "Limbă",
      "settings.dangerZone": "Zonă de pericol",
      "settings.clearKb": "Golește această bază de cunoștințe",
      "settings.clearKbHint": "Șterge toate gândurile din baza de cunoștințe curentă și pornește de la zero.",
      "confirm.deleteCascade": "Ștergi „{title}” și toți descendenții săi? Această acțiune nu poate fi anulată.",
      "confirm.delete": "Ștergi „{title}”? Această acțiune nu poate fi anulată.",
      "toast.alreadyExists": "„{title}” există deja — am selectat-o.",
      "toast.dupTitle": "Există deja un gând cu acest titlu — nu salvez un duplicat.",
      "pick.autoReason": "Titlu automat (prima linie)",
      "pick.originalReason": "Întrebarea originală",
      "pick.aiBadge": "AI",
      "pick.autoBadge": "Auto",
      "pick.hint": "Alege un titlu pentru noul gând sau păstrează-l pe cel automat.",
      "toast.savedAs": "✓ Salvat ca gând #{id}",
      "toast.suggesting": "✨ Sugerez unde să leg…",
      "toast.suggestion": "✨ Sugestie AI: {parent}",
      "toast.saveUnder": "Salvează sub „{parent}”",
      "toast.saveAsRoot": "Salvează ca gând rădăcină",
      "toast.suggestsUnder": "AI sugerează legarea sub „{parent}” — {reason}",
      "toast.suggestsRoot": "AI sugerează un gând rădăcină nou — {reason}",
      "toast.noIdeas": "Nu s-au extras idei din acest gând.",
      "toast.selectIdea": "Selectează cel puțin o idee.",
      "toast.selectIdeaHint": "Selectează ideile de adăugat ca gânduri-copil.",
      "toast.addedSkipped": ", sărite {n} existente deja",
      "toast.noRelated": "Nu s-au găsit gânduri legate noi.",
      "toast.selectThought": "Selectează cel puțin un gând.",
      "toast.addedThought": "S-au adăugat {n} gânduri",
      "toast.addedChild": "S-au adăugat {n} gânduri copil",
      "toast.noTitleSuggestions": "Nu s-au returnat sugestii de titlu.",
      "pick.currentTitle": "Titlul curent:",
      "btn.keepOriginal": "Păstrează originalul",
      "toast.titleUpdated": "Titlu actualizat la „{title}”",
      "toast.noConnections": "Nu s-au găsit conexiuni noi.",
      "toast.linked": "Legat „{child}” sub „{parent}”",
      "toast.kbCleared": "Baza de cunoștințe a fost golită",
      "toast.contentUpdated": "Conținut actualizat",
      "toast.translatedTitle": "S-au tradus {n} titluri",
      "toast.translatedDetail": "S-au tradus {n} detalii",
      "toast.allTranslated": "Toate titlurile sunt deja traduse",
      "toast.allDetailsTranslated": "Toate detaliile sunt deja traduse",
      "toast.switched": "Comutat la „{name}”",
      "toast.created": "Creat „{name}”",
      "toast.renamed": "Redenumit în „{name}”",
      "toast.deleted": "Șters",
      "toast.applyAll": "Aplică toate",
      "toast.addAsChild": "Adaugă „{title}” ca copil",
      "toast.linkUnder": "Leagă „{title}” sub „{parent}”",
      "toast.moveUnder": "Mută „{child}” sub „{parent}”",
      "toast.updated": "Actualizat",
      "toast.copied": "✓ Copiat",
      "chat.copyAnswer": "Copiază acest răspuns",
      "prompt.title": "Titlu",
      "prompt.content": "Conținut",
      "prompt.savePrompt": "Salvează promptul ca gând",
      "conn.find": "Găsește conexiuni",
      "conn.empty": "Niciun gând de conectat",
      "conn.new": "Conexiuni noi",
      "conn.foundHint": "AI-ul a găsit {n} relație{s} între gândurile tale. Aplică-le pe cele care au sens.",
      "conn.linkedMark": "✓ legat",
      "import.confirm": "Importul va înlocui întreaga ta bază de cunoștințe. Continui?",
      "import.failed": "Importul a eșuat",
      "rel.children": "Gânduri copil",
      "rel.childrenHint": "Subtopici / idei care extind acest gând",
      "rel.siblings": "Gânduri frați",
      "rel.siblingsHint": "Gânduri legate sub același părinte",
      "rel.siblingsNoParent": "Fără părinte — acest gând nu are frați",
      "rel.parents": "Gânduri părinte",
      "rel.parentsHint": "Concepte mai largi sub care se încadrează acest gând",
      "rel.childrenShort": "copii",
      "rel.siblingsShort": "frați",
      "rel.parentsShort": "părinți",
      "rel.selectHint": "Selectează gândurile de adăugat în baza de cunoștințe.",
      "rel.modalTitle": "Generează legate pentru „{title}”",
      "re.misplaced": "Copii greșiți plasați",
      "re.misplacedNone": "Niciunul — toți copiii se potrivesc aici.",
      "re.suggested": "Copii noi sugerați",
      "re.none": "Niciunul.",
    },
  };

  function lang() {
    return state.settings && state.settings.language === "ro" ? "ro" : "en";
  }

  // Translate helper (named `tr` to avoid colliding with the common `t`
  // local used for "thought" across this file).
  function tr(key, vars) {
    const table = I18N[lang()] || I18N.en;
    let s = table[key] ?? I18N.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split("{" + k + "}").join(v);
      }
    }
    return s;
  }

  // Fill static [data-i18n], [data-i18n-ph], [data-i18n-title] elements.
  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = tr(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.setAttribute("placeholder", tr(el.dataset.i18nPh));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", tr(el.dataset.i18nTitle));
    });
  }

  const cy = window.cytoscape({
    container: document.getElementById("graph"),
    elements: [],
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#d97b3a",
          "background-fill": "radial-gradient",
          "background-gradient-stop-colors": ["#ffd28a", "#d97b3a"],
          "background-gradient-stop-positions": ["0%", "55%"],
          "border-width": 4,
          "border-color": "data(sourceColor)",
          "box-shadow": "0 2px 8px rgba(0,0,0,0.18)",
          "width": 26,
          "height": 26,
          "label": "data(label)",
          "font-size": 12,
          "text-wrap": "wrap",
          "text-max-width": 90,
          "text-valign": "bottom",
          "text-margin-y": 8,
          "text-background-color": "rgba(255,255,255,0.85)",
          "text-background-opacity": 1,
          "text-background-padding": "3px",
          "text-background-shape": "roundrectangle",
          "color": "#3a352d",
          "overlay-opacity": 0,
        },
      },
      {
        selector: "node[childCount > 0]",
        style: {
          "border-style": "dashed",
          "border-color": "#9aa093",
          "border-width": 2,
        },
      },
      {
        selector: "node.selected",
        style: { "border-color": "#3b6fd4", "border-width": 4 },
      },
      {
        selector: "edge",
        style: {
          "width": 1.5,
          "line-color": "#c9c5bb",
          "target-arrow-color": "#c9c5bb",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.9,
        },
      },
      {
        selector: "edge.selected",
        style: { "line-color": "#3b6fd4", "target-arrow-color": "#3b6fd4", "width": 2.5 },
      },
    ],
    layout: { name: "cose", animate: false },
  });

  // ------------------------------------------------------------- dom refs

  const $ = (id) => document.getElementById(id);
  const graphEl = $("graph");
  const outlineEl = $("outline");
  const previewEl = $("node-preview");
  const emptyHint = $("empty-hint");
  const linkHint = $("link-hint");
  const layoutSelect = $("layout-select");
  const btnLink = $("btn-link");
  const chatMessages = $("chat-messages");
  const promptInput = $("prompt-input");
  const ctxEnabled = $("ctx-enabled");
  const ctxLabel = $("ctx-label");
  const saveRow = $("save-row");
  const saveTarget = $("save-target");
  const detailEmpty = $("detail-empty");
  const detailBody = $("detail-body");
  const detailTitle = $("detail-title");
  const detailId = $("detail-id");
  const detailMeta = $("detail-meta");
  const detailContent = $("detail-content");
  const detailParents = $("detail-parents");
  const detailChildren = $("detail-children");
  const detailSiblings = $("detail-siblings");
  const detailBacklinks = $("detail-backlinks");
  const modalOverlay = $("modal-overlay");
  const modalTitle = $("modal-title");
  const modalBody = $("modal-body");
  const chatStatus = $("chat-status");

  // ------------------------------------------------------------- api helpers

  async function api(path, opts = {}) {
    const resp = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!resp.ok) {
      let detail = resp.statusText;
      try {
        const data = await resp.json();
        detail = data.detail || detail;
      } catch (e) { /* not JSON */ }
      if (typeof detail === "object" && detail !== null) {
        const err = new Error(detail.message || resp.statusText);
        err.existingId = detail.existing_id;
        throw err;
      }
      throw new Error(typeof detail === "string" ? detail : resp.statusText);
    }
    return resp.json();
  }

  async function createThought(payload) {
    try {
      // The backend always stores English as primary and Romanian alongside,
      // so no skip flag is needed regardless of the UI language.
      return await post("/api/thoughts", payload);
    } catch (err) {
      if (err.existingId) {
        toast(tr("toast.alreadyExists", { title: payload.title }));
        selectThought(err.existingId);
        return null;
      }
      throw err;
    }
  }

  function post(path, body) {
    return api(path, { method: "POST", body: JSON.stringify(body) });
  }
  function put(path, body) {
    return api(path, { method: "PUT", body: JSON.stringify(body) });
  }
  function del(path) {
    return api(path, { method: "DELETE" });
  }

  // ------------------------------------------------------------- graph

  function renderGraph() {
    // How many children each node draws, via its primary parent (consistent
    // with the cascade layout).
    const primary = new Map();
    for (const e of state.edges) {
      if (!primary.has(e.child_id)) primary.set(e.child_id, e.parent_id);
    }
    const primaryChildCount = new Map();
    for (const e of state.edges) {
      if (primary.get(e.child_id) === e.parent_id) {
        primaryChildCount.set(e.parent_id, (primaryChildCount.get(e.parent_id) || 0) + 1);
      }
    }
    const nodes = state.thoughts.map((t) => ({
      data: {
        id: String(t.id),
        label: fmtTitle(t),
        thought: t,
        sourceColor: sourceColor(t.source),
        childCount: primaryChildCount.get(t.id) || 0,
      },
    }));
    const edges = state.edges.map((e) => ({
      data: {
        id: "e" + e.id,
        source: String(e.parent_id),
        target: String(e.child_id),
        label: e.label,
      },
    }));
    cy.json({ elements: { nodes, edges } });
    emptyHint.classList.toggle("hidden", state.thoughts.length > 0);
    if (state.thoughts.length > 0) cy.layout(layoutOptions(layoutSelect.value)).run();
    updateSelectionUI();
  }

  // Widen the layout so bilingual node titles are fully readable and don't overlap.
  function layoutOptions(name) {
    const base = { name, animate: true };
    if (name === "mindmap") {
      return { name: "preset", positions: computeCascadingPositions(), animate: false, padding: 40, fit: true };
    }
    if (name === "breadthfirst") {
      return { ...base, spacingFactor: 1.7, padding: 80 };
    }
    if (name === "concentric") {
      return { ...base, spacingFactor: 2.4, padding: 80 };
    }
    return {
      ...base,
      idealEdgeLength: 200,
      nodeRepulsion: 6000,
      nodeOverlap: 45,
      padding: 80,
      nodeDimensionsIncludeLabels: true,
    };
  }

  // Cascading (left-to-right tree) positions, TheBrain Mind Map style: the
  // selected thought anchors the left, children branch rightward, and each
  // parent is vertically centered among its children (siblings fan above/below).
  function computeCascadingPositions() {
    const H = 340;   // horizontal step per depth
    const V = 100;   // vertical step per thought
    const childMap = new Map();
    const parentMap = new Map();
    for (const e of state.edges) {
      if (!childMap.has(e.parent_id)) childMap.set(e.parent_id, []);
      childMap.get(e.parent_id).push(e.child_id);
      if (!parentMap.has(e.child_id)) parentMap.set(e.child_id, []);
      parentMap.get(e.child_id).push(e.parent_id);
    }
    const hasParent = (id) => (parentMap.get(id) || []).length > 0;

    // Primary parent per node so each thought appears once in the layout.
    const primary = new Map();
    for (const e of state.edges) {
      if (!primary.has(e.child_id)) primary.set(e.child_id, e.parent_id);
    }

    let rootId = null;
    const selId = state.selectedThought ? state.selectedThought.id : null;
    if (selId && state.thoughts.some((t) => t.id === selId)) {
      rootId = selId;
    } else {
      const top = state.thoughts.find((t) => !hasParent(t.id));
      rootId = top ? top.id : null;
    }

    const positions = {};
    if (rootId != null) {
      // Walk from the root in both directions: children (depth+1) and the
      // primary parent chain (depth-1). First visit wins.
      const depth = new Map();
      const queue = [rootId];
      depth.set(rootId, 0);
      const reached = [];
      while (queue.length) {
        const id = queue.shift();
        reached.push(id);
        const d = depth.get(id);
        for (const c of (childMap.get(id) || [])) {
          if (primary.get(c) !== id) continue;
          if (!depth.has(c)) { depth.set(c, d + 1); queue.push(c); }
        }
        const p = primary.get(id);
        if (p !== undefined && !depth.has(p)) { depth.set(p, d - 1); queue.push(p); }
      }

      // Balanced tidy-tree assignment: leaves take consecutive vertical slots;
      // internal nodes sit at the average y of their children, so each parent is
      // vertically centered among its children and children fan above/below it
      // (the "Y" shape). Sibling subtrees occupy contiguous bands -> no overlaps.
      let slot = 0;
      const assignY = (id) => {
        if (positions[id] !== undefined) return positions[id].y;
        const d = depth.get(id);
        const kids = (childMap.get(id) || []).filter((c) => {
          return primary.get(c) === id && depth.get(c) === d + 1;
        });
        if (kids.length === 0) {
          const y = slot * V;
          slot += 1;
          positions[id] = { x: d * H, y };
          return y;
        }
        let firstY = null;
        let lastY = null;
        for (const k of kids) {
          const ky = assignY(k);
          if (firstY === null) firstY = ky;
          lastY = ky;
        }
        const y = (firstY + lastY) / 2;
        positions[id] = { x: d * H, y };
        return y;
      };
      // Top of the reached tree = minimum depth node.
      let top = rootId;
      for (const id of reached) {
        if (depth.get(id) < depth.get(top)) top = id;
      }
      assignY(top);

      // Normalize so the leftmost node is at x = H (keeps the map in positive x).
      let minX = Infinity;
      for (const k in positions) minX = Math.min(minX, positions[k].x);
      if (minX < 0) {
        const shift = -minX + H;
        for (const k in positions) positions[k].x += shift;
      }
    }

    // Any node not reached goes into a trailing block below (also diagonal).
    const leftover = state.thoughts.filter((t) => positions[t.id] === undefined);
    const baseY = Math.max(0, ...Object.values(positions).map((p) => p.y)) + V;
    leftover.forEach((t, i) => {
      positions[t.id] = { x: H, y: baseY + i * V };
    });

    return (node) => positions[node.id()] || { x: 0, y: 0 };
  }

  // ------------------------------------------------------------ node preview

  // Floating card shown while hovering a graph node. Lives inside the
  // graph container, positioned at the cursor so it doesn't block the node.
  function updatePreviewPos() {
    const cardW = previewEl.offsetWidth || 300;
    const cardH = previewEl.offsetHeight || 120;
    const margin = 14;
    let x = state._previewX + margin;
    let y = state._previewY + margin;
    // Measure the container (not the #graph canvas) — #graph is inset:0 but the
    // container carries the grid width/height.
    const container = graphEl.parentElement;
    const cw = container ? container.clientWidth : 0;
    const ch = container ? container.clientHeight : 0;
    if (cw && x + cardW > cw) x = Math.max(0, state._previewX - cardW - margin);
    if (ch && y + cardH > ch) y = Math.max(0, state._previewY - cardH - margin);
    previewEl.style.left = x + "px";
    previewEl.style.top = y + "px";
  }

  function buildPreviewHtml(t) {
    const content = displayContent(t).trim();
    const snippet = content
      ? content.replace(/\s+/g, " ").slice(0, 200) + (content.length > 200 ? "…" : "")
      : "";
    let parts = [];
    if (t.source) {
      const sc = sourceColor(t.source);
      parts.push(
        '<span class="src-badge" style="border-color:' + sc + ';color:' + sc + '">' +
          escHtml(sourceLabel(t.source)) + "</span>"
      );
    }
    if (t.question_type) {
      const ql = t.question_type.charAt(0).toUpperCase() + t.question_type.slice(1);
      parts.push(
        '<span class="src-badge" style="border-color:#3b6fd4;color:#3b6fd4">Q: ' +
          escHtml(ql) + "</span>"
      );
    }
    // Badges (thought type + question type) sit in their own row below the title.
    const badges = parts.length
      ? '<div class="preview-badges">' + parts.join("") + "</div>"
      : "";
    // Graph nodes are flat, so derive relationship counts from the edges.
    const kids = state.edges.filter((e) => e.parent_id === t.id).length;
    const pars = state.edges.filter((e) => e.child_id === t.id).length;
    const parentSet = new Set(
      state.edges.filter((e) => e.child_id === t.id).map((e) => e.parent_id)
    );
    const sibs = new Set(
      state.edges
        .filter((e) => parentSet.has(e.parent_id) && e.child_id !== t.id)
        .map((e) => e.child_id)
    ).size;
    const metaBits = [];
    if (kids) metaBits.push("<strong>" + kids + "</strong> child" + (kids !== 1 ? "ren" : ""));
    if (pars) metaBits.push("<strong>" + pars + "</strong> parent" + (pars !== 1 ? "s" : ""));
    if (sibs) metaBits.push("<strong>" + sibs + "</strong> sibling" + (sibs !== 1 ? "s" : ""));
    return (
      '<div class="preview-title">' + escHtml(fmtTitle(t)) + "</div>" +
      badges +
      (snippet ? '<div class="preview-content">' + escHtml(snippet) + "</div>" : "") +
      (metaBits.length ? '<div class="preview-meta">' + metaBits.join(" &nbsp;·&nbsp; ") + "</div>" : "")
    );
  }

  // Shared hitbox for mousemove + hover + unhover so the card disappears
  // once the pointer leaves the node (cytoscape unions mousemove/hover
  // target events over the node and its interactive label/background).
  function isGraphNodeHit(target) {
    return target != null && target.isNode && target.isNode();
  }

  function showNodePreview(t, x, y) {
    state._previewX = x;
    state._previewY = y;
    previewEl.innerHTML = buildPreviewHtml(t);
    previewEl.classList.remove("hidden");
    updatePreviewPos();
  }

  function hideNodePreview() {
    previewEl.classList.add("hidden");
    previewEl.innerHTML = "";
  }

  // ------------------------------------------------------------ outline

  function setView(mode) {
    state.viewMode = mode;
    hideNodePreview();
    const graphMode = mode === "graph";
    graphEl.classList.toggle("hidden", !graphMode);
    outlineEl.classList.toggle("hidden", graphMode);
    $("btn-view-graph").classList.toggle("active", graphMode);
    $("btn-view-outline").classList.toggle("active", !graphMode);
    layoutSelect.classList.toggle("hidden", !graphMode);
    linkHint.classList.toggle("hidden", !graphMode || state.selected.length !== 2);
    if (!graphMode) renderOutline();
  }

  function buildChildrenMap() {
    const map = new Map();
    for (const e of state.edges) {
      if (!map.has(e.parent_id)) map.set(e.parent_id, []);
      map.get(e.parent_id).push(e.child_id);
    }
    return map;
  }

  function renderOutline() {
    if (state.outlineExpanded === null) {
      state.outlineExpanded = new Set(state.thoughts.map((t) => t.id));
    }
    const children = buildChildrenMap();
    const childSet = new Set(state.edges.map((e) => e.child_id));
    const roots = state.thoughts.filter((t) => !childSet.has(t.id));

    const container = outlineEl;
    container.innerHTML = "";
    if (state.thoughts.length === 0) {
      container.innerHTML = '<div class="outline-empty">' + tr("outline.empty") + '</div>';
      updateOutlineSelection();
      return;
    }
    for (const root of roots) {
      buildOutlineNode(container, root.id, children, 0, new Set());
    }
    updateOutlineSelection();
  }

  function buildOutlineNode(container, id, children, depth, path) {
    const thought = state.thoughts.find((t) => t.id === id);
    if (!thought) return;
    const kids = children.get(id) || [];
    const expanded = state.outlineExpanded.has(id);
    const row = document.createElement("div");
    row.className = "outline-row" + (expanded && kids.length ? " expanded" : "");
    row.dataset.id = id;
    row.style.paddingLeft = (8 + depth * 18) + "px";

    if (kids.length) {
      const caret = document.createElement("span");
      caret.className = "caret";
      caret.textContent = expanded ? "▾" : "▸";
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        if (expanded) state.outlineExpanded.delete(id);
        else state.outlineExpanded.add(id);
        renderOutline();
      });
      row.appendChild(caret);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "caret spacer";
      spacer.textContent = "";
      row.appendChild(spacer);
    }

    const label = document.createElement("span");
    label.className = "outline-label";
    label.textContent = fmtTitle(thought);
    row.appendChild(label);

    if (kids.length) {
      const badge = document.createElement("span");
      badge.className = "outline-count";
      badge.textContent = "(" + kids.length + ")";
      row.appendChild(badge);
    }

    row.addEventListener("click", () => {
      // clicking the caret stops propagation, so this only fires for the label
      selectThought(id);
    });
    container.appendChild(row);

    if (expanded) {
      for (const kidId of kids) {
        const nextPath = new Set(path);
        nextPath.add(id);
        if (nextPath.has(kidId)) continue; // cycle guard
        buildOutlineNode(container, kidId, children, depth + 1, nextPath);
      }
    }
  }

  function updateOutlineSelection() {
    const selectedId = state.selectedThought ? state.selectedThought.id : null;
    const rows = outlineEl.querySelectorAll(".outline-row");
    rows.forEach((r) => r.classList.toggle("active", Number(r.dataset.id) === selectedId));
    if (selectedId != null) {
      const active = outlineEl.querySelector(".outline-row.active");
      if (active) active.scrollIntoView({ block: "nearest" });
    }
  }

  function getSelectedThoughts() {
    return cy.nodes(":selected").map((n) => n.data("thought"));
  }

  function updateSelectionUI() {
    const sel = getSelectedThoughts();
    state.selectedThought = sel[0] || null;
    state.selected = cy.nodes(":selected").map((n) => n.id());

    const bothSelected = sel.length === 2;
    linkHint.classList.toggle("hidden", !bothSelected);
    if (bothSelected) {
      linkHint.textContent =
        tr("toolbar.linkHint", { a: short(sel[0].title), b: short(sel[1].title) });
    }
    btnLink.disabled = !bothSelected;

    const ctx = state.selectedThought;
    const enabled = ctxEnabled.checked;
    ctxLabel.textContent = enabled && ctx
      ? tr("chat.contextPrefix") + short(ctx.title)
      : tr("chat.useContext");
    ctxEnabled.disabled = !ctx;

    if (ctx) loadThoughtDetail(ctx.id);
    else showDetail(null);
    updateOutlineSelection();
    loadFollowups();
    recenterMindmap();
  }

  let mindmapTimer = null;
  function recenterMindmap() {
    if (state.viewMode !== "graph" || layoutSelect.value !== "mindmap") return;
    const sel = state.selectedThought;
    clearTimeout(mindmapTimer);
    mindmapTimer = setTimeout(() => {
      cy.layout(layoutOptions("mindmap")).run();
      if (sel) {
        const node = cy.$("#" + sel.id);
        if (node.length) {
          // Center on the selection but keep a readable zoom (don't zoom to 0.2x).
          cy.animate({
            center: { eles: node },
            zoom: Math.max(cy.zoom(), 0.7),
          }, { duration: 250 });
        } else {
          cy.fit(undefined, 60);
        }
      } else {
        // Nothing selected: the preset layout already fits the whole tree.
        // Just ensure the view is centered so all levels are visible.
        cy.fit(undefined, 40);
      }
    }, 150);
  }

  async function loadThoughtDetail(id) {
    try {
      const [detail, comments] = await Promise.all([
        api("/api/thoughts/" + id),
        api("/api/thoughts/" + id + "/comments"),
      ]);
      // only render if this thought is still the selected one
      if (state.selectedThought && state.selectedThought.id === id) {
        showDetail(detail);
        renderComments(comments);
      }
    } catch (e) { /* selection may have changed; ignore */ }
  }

  cy.on("select unselect tap", updateSelectionUI);

  // prevent "selected" styling clobbering our css-class selection
  cy.on("tap", "node", (evt) => {
    if (evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey)) {
      evt.target.toggleClass("selected");
    }
  });

  // ---- hover previews -------------------------------------------------
  cy.on("mousemove", (evt) => {
    const target = evt.target;
    if (evt.target !== cy && isGraphNodeHit(target)) {
      const t = target.data().thought;
      if (t) {
        showNodePreview(t, evt.renderedPosition.x, evt.renderedPosition.y);
        return;
      }
    }
    hideNodePreview();
  });
  cy.on("hover", "node", (evt) => {
    // mouseenter already fired mousemove; only catch programmatic entry
    if (state._previewX === undefined) {
      const t = evt.target.data().thought;
      if (t) {
        showNodePreview(t, evt.renderedPosition.x, evt.renderedPosition.y);
      }
    }
  });
  cy.on("unhover", "node", hideNodePreview);

  function selectThought(id) {
    cy.nodes().unselect();
    const node = cy.$("#" + id);
    if (node.length) node.select();
    state.selectedThought = state.thoughts.find((t) => t.id === id);
    updateSelectionUI();
  }

  // ------------------------------------------------------------- detail

  function short(text, max = 24) {
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + "…";
  }

  function isRo() {
    return state.settings && state.settings.language === "ro";
  }

  function fmtTitle(t) {
    if (!t) return "";
    const ro = (t.title_ro || "").trim();
    const en = t.title.trim();
    if (isRo()) {
      if (ro && ro.toLowerCase() !== en.toLowerCase()) return ro + " (" + en + ")";
      return ro || en;
    }
    if (ro && ro.toLowerCase() !== en.toLowerCase()) return en + " (" + ro + ")";
    return en;
  }

  function displayContent(t) {
    if (!t) return "";
    if (isRo() && (t.content_ro || "").trim()) return t.content_ro;
    return t.content || "";
  }

  // Which thoughts mention this thought's title in their content but aren't
  // already linked to it. A "linked" thought is a direct parent or child
  // (siblings are not linked to each other). Match against the raw English
  // text first; if the UI is Romanian, also match the Romanian content.
  function computeBacklinks(t) {
    if (!t) return [];
    const linkedIds = new Set([
      ...(t.parents || []).map((p) => p.id),
      ...(t.children || []).map((p) => p.id),
    ]);
    const needles = [];
    if (t.title && t.title.trim()) needles.push(t.title.trim());
    if (isRo() && t.title_ro && t.title_ro.trim()) needles.push(t.title_ro.trim());
    const out = [];
    for (const other of state.thoughts) {
      if (other.id === t.id || linkedIds.has(other.id)) continue;
      const match = findBacklinkMatch(other, needles);
      if (match) out.push({ thought: other, snippet: match.snippet, idx: match.idx, needle: match.needle });
    }
    return out;
  }

  // Find where any needle occurs in this thought's content, and build a
  // snippet centered on the first match. Content is normalized to one line
  // and truncated with ellipses either side.
  function findBacklinkMatch(other, needles) {
    const text = displayContent(other) || "";
    const norm = text.replace(/\s+/g, " ").trim();
    const lower = norm.toLowerCase();
    let first = null;
    let matched = null;
    for (const needle of needles) {
      const idx = lower.indexOf(needle.toLowerCase());
      if (idx !== -1 && (first === null || idx < first)) {
        first = idx;
        matched = needle;
      }
    }
    if (first === null) return null;
    const LEN = 36;
    const start = Math.max(0, first - LEN);
    const end = Math.min(norm.length, first + matched.length + LEN);
    let snippet = norm.slice(start, end);
    let idx = first - start;
    if (start > 0) {
      const trimmed = snippet.replace(/^\s+/, "");
      idx -= snippet.length - trimmed.length;
      snippet = "…" + trimmed;
      idx += 1;
    }
    snippet = snippet.replace(/\s+$/, "");
    if (end < norm.length) snippet = snippet + "…";
    return { snippet, idx, needle: matched };
  }

  // Apply the match highlight to the snippet by wrapping the (normalized,
  // needle-length) match range in <mark>. textContent insertion is safe; the
  // wrapping markup is built locally.
  function highlightSnippet(snippet, idx, needle) {
    const el = document.createElement("span");
    if (!snippet || idx < 0 || idx >= snippet.length) {
      el.textContent = snippet || "";
      return el;
    }
    const end = idx + needle.length;
    if (end > snippet.length) {
      el.textContent = snippet;
      return el;
    }
    const before = document.createTextNode(snippet.slice(0, idx));
    const mark = document.createElement("mark");
    mark.textContent = snippet.slice(idx, end);
    const after = document.createTextNode(snippet.slice(end));
    el.appendChild(before);
    el.appendChild(mark);
    el.appendChild(after);
    return el;
  }

  function titleById(id) {
    const t = state.thoughts.find((x) => x.id === id);
    return t ? fmtTitle(t) : "";
  }

  const SOURCE_INFO = {
    prompt: { labelKey: "src.prompt", descKey: "src.promptDesc", color: "#3a9d5d" },
    generated: { labelKey: "src.generated", descKey: "src.generatedDesc", color: "#3b6fd4" },
    extract: { labelKey: "src.extract", descKey: "src.extractDesc", color: "#8a5cd4" },
    manual: { labelKey: "src.manual", descKey: "src.manualDesc", color: "#d97b3a" },
  };
  function sourceLabel(source) {
    return tr((SOURCE_INFO[source] || {}).labelKey || "src.unknown");
  }
  function sourceColor(source) {
    return (SOURCE_INFO[source] || { color: "#b0aba2" }).color;
  }
  function sourceDesc(source) {
    const info = SOURCE_INFO[source];
    return info ? tr(info.descKey) : "";
  }

  const QTYPE_INFO = {
    scientific: { labelKey: "qtype.scientific", descKey: "qtype.scientificDesc", color: "#3b6fd4" },
    practical: { labelKey: "qtype.practical", descKey: "qtype.practicalDesc", color: "#3a9d5d" },
    comparative: { labelKey: "qtype.comparative", descKey: "qtype.comparativeDesc", color: "#8a5cd4" },
    historical: { labelKey: "qtype.historical", descKey: "qtype.historicalDesc", color: "#d97b3a" },
    causal: { labelKey: "qtype.causal", descKey: "qtype.causalDesc", color: "#c0392b" },
    critical: { labelKey: "qtype.critical", descKey: "qtype.criticalDesc", color: "#a8703a" },
    untyped: { labelKey: "qtype.untyped", descKey: "qtype.untypedDesc", color: "#b0aba2" },
  };
  function qtypeLabel(qtype) {
    return tr((QTYPE_INFO[qtype] || { labelKey: qtype }).labelKey);
  }
  function qtypeColor(qtype) {
    return (QTYPE_INFO[qtype] || { color: "#b0aba2" }).color;
  }
  function qtypeDesc(qtype) {
    const info = QTYPE_INFO[qtype];
    return info ? tr(info.descKey) : "";
  }

  function thoughtRow(t, countLabel) {
    const li = document.createElement("li");
    li.textContent = short(fmtTitle(t), 44);
    if (countLabel) {
      const span = document.createElement("span");
      span.className = "t-count";
      span.textContent = countLabel;
      li.appendChild(span);
    }
    li.addEventListener("click", () => selectThought(t.id));
    return li;
  }

  function showDetail(t) {
    if (!t) {
      detailEmpty.classList.remove("hidden");
      detailBody.classList.add("hidden");
      return;
    }
    detailEmpty.classList.add("hidden");
    detailBody.classList.remove("hidden");

    detailTitle.textContent = fmtTitle(t);
    detailId.textContent = "#" + t.id;
    const srcBadge = $("detail-source");
    if (t.source) {
      srcBadge.textContent = sourceLabel(t.source);
      srcBadge.style.borderColor = sourceColor(t.source);
      srcBadge.style.color = sourceColor(t.source);
      srcBadge.classList.remove("hidden");
    } else {
      srcBadge.classList.add("hidden");
    }
    const qtypeBadge = $("detail-qtype");
    if (t.question_type) {
      const label = (t.question_type.charAt(0).toUpperCase() + t.question_type.slice(1));
      qtypeBadge.textContent = tr("detail.qBadge") + label;
      qtypeBadge.style.borderColor = "#3b6fd4";
      qtypeBadge.style.color = "#3b6fd4";
      qtypeBadge.classList.remove("hidden");
    } else {
      qtypeBadge.classList.add("hidden");
    }
    detailMeta.textContent =
      tr("detail.created") + fmtDate(t.created_at) +
      (t.updated_at && t.updated_at !== t.created_at ? tr("detail.updated") + fmtDate(t.updated_at) : "");
    detailContent.textContent = displayContent(t) || tr("detail.noContent");

    const fill = (ul, list, label) => {
      ul.innerHTML = "";
      if (list.length === 0) {
        const li = document.createElement("li");
        li.className = "empty-note";
        li.textContent = label;
        ul.appendChild(li);
        return;
      }
      list.forEach((p) => {
        const full = state.thoughts.find((x) => x.id === p.id) || p;
        const count = full.children ? "(" + full.children.length + ")" : "";
        ul.appendChild(thoughtRow(full, count));
      });
    };
    fill(detailParents, t.parents || [], tr("detail.noParent"));
    fill(detailChildren, t.children || [], tr("detail.noChildren"));
    fill(detailSiblings, t.siblings || [], tr("detail.noSiblings"));
    renderBacklinks(t);
  }

  function renderBacklinks(t) {
    const list = detailBacklinks;
    list.innerHTML = "";
    const backlinks = computeBacklinks(t);
    if (backlinks.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-note";
      li.textContent = tr("detail.noBacklinks");
      list.appendChild(li);
      return;
    }
    backlinks.forEach(({ thought, snippet, idx, needle }) => {
      const li = document.createElement("li");
      li.className = "backlink-row";
      const title = document.createElement("div");
      title.className = "backlink-title";
      title.textContent = short(fmtTitle(thought), 44);
      const snip = document.createElement("div");
      snip.className = "backlink-snippet";
      snip.appendChild(highlightSnippet(snippet, idx, needle));
      li.addEventListener("click", () => selectThought(thought.id));
      li.appendChild(title);
      li.appendChild(snip);
      list.appendChild(li);
    });
  }

  async function renderComments(comments) {
    const list = $("comments-list");
    list.innerHTML = "";
    if (!comments || comments.length === 0) {
      const div = document.createElement("div");
      div.className = "comment empty";
      div.textContent = tr("detail.noComments");
      list.appendChild(div);
      return;
    }
    comments.forEach((c) => {
      const row = document.createElement("div");
      row.className = "comment";
      const text = document.createElement("div");
      text.className = "comment-text";
      text.textContent = c.text;
      const meta = document.createElement("div");
      meta.className = "comment-meta";
      meta.textContent = fmtDate(c.created_at);
      const delBtn = document.createElement("button");
      delBtn.className = "btn comment-del";
      delBtn.textContent = tr("btn.delete");
      delBtn.addEventListener("click", async () => {
        try {
          await del("/api/comments/" + c.id);
          const cur = state.selectedThought;
          if (cur) {
            const fresh = await api("/api/thoughts/" + cur.id + "/comments");
            renderComments(fresh);
          }
        } catch (err) { toast(err.message); }
      });
      row.appendChild(text);
      row.appendChild(meta);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  async function addComment() {
    const t = state.selectedThought;
    if (!t) return;
    const input = $("comment-input");
    const text = input.value.trim();
    if (!text) return;
    try {
      await post("/api/thoughts/" + t.id + "/comments", { text });
      input.value = "";
      const fresh = await api("/api/thoughts/" + t.id + "/comments");
      renderComments(fresh);
    } catch (err) { toast(err.message); }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch (e) { return iso; }
  }

  // ------------------------------------------------------------- chat

  function appendChat(type, text) {
    const div = document.createElement("div");
    div.className = type === "error" ? "msg error" : type === "reasoning" ? "msg reasoning" : "msg " + type;
    if (type === "ai") {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = marked.parse(text);
      div.appendChild(bubble);
      const copyBtn = copyButton(tr("chat.copyAnswer"));
      copyBtn.addEventListener("click", () => {
        copyText(bubble.innerText);
        flashCopied(copyBtn);
      });
      div.appendChild(copyBtn);
    } else if (type === "thinking-label") {
      const label = document.createElement("div");
      label.textContent = text;
      div.appendChild(label);
    } else if (type === "reasoning") {
      div.textContent = text;
    } else if (type === "user") {
      div.textContent = text;
    } else {
      div.textContent = text;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  async function sendChat() {
    const prompt = promptInput.value.trim();
    if (!prompt || state.chatInFlight) return;
    state.chatInFlight = true;
    $("btn-send").disabled = true;
    state.lastPrompt = prompt;
    resetSuggestion();

    appendChat("user", prompt);
    state.chatHistory.push({ role: "user", content: prompt });
    promptInput.value = "";

    let contextId = null;
    if (ctxEnabled.checked && state.selectedThought) {
      contextId = state.selectedThought.id;
    }

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context_thought_id: contextId }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || "Chat request failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiEl = null;
      let reasoningEl = null;
      let aiText = "";
      let reasoningText = "";
      let savedResponse = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const evt = parseSSE(part);
          if (!evt) continue;
          if (evt.event === "delta") {
            if (!aiEl) {
              aiEl = appendChat("ai", "");
              aiEl.querySelector(".bubble").innerHTML = "";
            }
            aiText += evt.data.content || "";
            aiEl.querySelector(".bubble").innerHTML = marked.parse(aiText);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } else if (evt.event === "reasoning") {
            if (!reasoningEl) {
              reasoningEl = appendChat("reasoning", "");
            }
            reasoningText += evt.data.content || "";
            reasoningEl.textContent = "💭 " + reasoningText;
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } else if (evt.event === "error") {
            appendChat("error", evt.data.message || "DeepSeek error");
          } else if (evt.event === "done") {
            savedResponse = aiText || (evt.data && evt.data.response) || null;
          }
        }
      }
      if (savedResponse) {
        state.chatHistory.push({ role: "assistant", content: savedResponse });
        saveRow.classList.remove("hidden");
        $("btn-save-prompt").classList.remove("hidden");
        suggestLink(autoTitle(savedResponse), savedResponse, state.lastPrompt);
      }
    } catch (err) {
      appendChat("error", err.message);
    } finally {
      state.chatInFlight = false;
      $("btn-send").disabled = false;
      promptInput.focus();
    }
  }

  function parseSSE(part) {
    const lines = part.split("\n");
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return null;
    const raw = dataLines.join("\n");
    let data = {};
    try { data = JSON.parse(raw); } catch (e) { data = { content: raw }; }
    return { event, data };
  }

  function autoTitle(text) {
    const firstLine = text.split("\n").find((l) => l.trim().length > 0) || text;
    const cleaned = firstLine.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();
    if (!cleaned) return "Thought " + (state.thoughts.length + 1);
    // Cap at 120 chars, but don't cut mid-word.
    if (cleaned.length > 120) {
      const cut = cleaned.slice(0, 120);
      const lastSpace = cut.lastIndexOf(" ");
      return lastSpace > 60 ? cut.slice(0, lastSpace) : cut;
    }
    return cleaned;
  }

  async function saveResponseAsThought(targetOverride) {
    const target = targetOverride || saveTarget.value;
    const last = [...state.chatHistory].reverse().find((m) => m.role === "assistant");
    const content = last ? last.content : "";
    if (!content) {
      appendChat("error", "No response to save yet.");
      return;
    }
    const parentIds = [];
    if (target === "suggestion") {
      if (state.suggestion && state.suggestion.parent_id != null) parentIds.push(state.suggestion.parent_id);
    } else if (target === "child" && state.selectedThought) {
      parentIds.push(state.selectedThought.id);
    } else if (target === "sibling" && state.selectedThought && state.selectedThought.parents.length) {
      parentIds.push(state.selectedThought.parents[0].id);
    }
    try {
      const auto = autoTitle(content);
      let suggestions = [];
      try {
        const data = await post("/api/chat/suggest-title", { title: auto, content });
        suggestions = data.suggestions || [];
      } catch (e) { /* fall back to auto title if suggestion fails */ }
      showSaveTitlePicker(auto, suggestions, parentIds, content);
    } catch (err) {
      appendChat("error", err.message);
    }
  }

  function showSaveTitlePicker(auto, suggestions, parentIds, content) {
    // The first row is the original question as typed; the auto title follows,
    // then the AI-suggested titles.
    const original = state.lastPrompt ? state.lastPrompt.trim() : "";
    const rows = [
      { title: original, reason: tr("pick.originalReason"), original: true },
      { title: auto, reason: tr("pick.autoReason"), auto: true },
      ...suggestions.map((s) => ({ title: s.title, reason: s.reason || "", ai: true })),
    ];
    const list = rows.map((r, i) => `
      <label class="idea-row clickable" data-i="${i}">
        <span class="idea-text">
          <span class="idea-title">${escHtml(r.title)}
            ${r.original ? '<span class="auto-badge">' + escHtml(tr("pick.originalReason")) + '</span>' : ""}
            ${r.auto ? '<span class="auto-badge">' + escHtml(tr("pick.autoBadge")) + '</span>' : ""}
            ${r.ai ? '<span class="auto-badge">' + escHtml(tr("pick.aiBadge")) + '</span>' : ""}
          </span>
          <span class="idea-summary">${escHtml(r.reason)}</span>
        </span>
      </label>
    `).join("");
    const m = openModal(tr("modal.chooseTitle"), `
      <p class="form-hint" style="margin-top:0">${tr("pick.hint")}</p>
      <div class="idea-list">${list}</div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = () => { m.close(); };
    m.body.querySelectorAll(".idea-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const chosen = rows[Number(row.dataset.i)];
        m.close();
        try {
          const created = await createThought({
            title: chosen.title,
            content: content,
            parent_ids: parentIds,
            source: "prompt",
            question_type: state.pendingQuestionType || "",
          });
          state.pendingQuestionType = null;
          if (!created) {
            appendChat("error", tr("toast.dupTitle"));
            return;
          }
          await refreshGraph();
          selectThought(created.id);
          saveRow.classList.add("hidden");
          resetSuggestion();
          appendChat("reasoning", tr("toast.savedAs", { id: created.id }));
        } catch (err) {
          appendChat("error", err.message);
        }
      });
    });
  }

  function exportChatMd() {
    // Pair each user prompt with the assistant answer that follows it (or the
    // last answer if the final message is a prompt). Every completed prompt is
    // written as a title, its answer as the body — matching the user's request.
    const messages = state.chatHistory;
    const pairs = [];
    let pendingPrompt = null;
    for (const m of messages) {
      if (m.role === "user") {
        pendingPrompt = m.content;
      } else if (m.role === "assistant" && pendingPrompt) {
        pairs.push({ prompt: pendingPrompt, answer: m.content });
        pendingPrompt = null;
      }
    }
    if (pairs.length === 0) {
      toast(tr("chat.exportEmpty"));
      return;
    }
    const parts = pairs.map(({ prompt, answer }) => {
      const title = prompt.replace(/\s+/g, " ").trim();
      const body = (answer || "").trim();
      return `# ${title}\n\n${body}`;
    });
    const md = parts.join("\n\n---\n\n") + "\n";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (title) => title.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "chat-export";
    a.href = url;
    a.download = safe(pairs[pairs.length - 1].prompt) + ".md";
    a.click();
    URL.revokeObjectURL(url);
    toast(tr("chat.exportDone"));
  }

  // -------------------------------------------------------- link suggestion

  const BASE_SAVE_TARGETS = [
    { value: "child", key: "chat.saveChild" },
    { value: "sibling", key: "chat.saveSibling" },
    { value: "root", key: "chat.saveRoot" },
  ];

  function resetSuggestion() {
    state.suggestion = null;
    const bar = $("suggestion-bar");
    if (bar) bar.classList.add("hidden");
    $("suggestion-text").textContent = "";
    $("btn-save-suggestion").classList.add("hidden");
    $("save-target").innerHTML = BASE_SAVE_TARGETS.map(
      (o) => `<option value="${o.value}">${tr(o.key)}</option>`
    ).join("");
  }

  async function suggestLink(title, content, prompt) {
    const bar = $("suggestion-bar");
    const text = $("suggestion-text");
    bar.classList.remove("hidden");
    text.textContent = tr("toast.suggesting");
    try {
      const data = await post("/api/chat/suggest-link", { title, content, prompt });
      const select = $("save-target");
      select.innerHTML = BASE_SAVE_TARGETS.map(
        (o) => `<option value="${o.value}">${tr(o.key)}</option>`
      ).join("");
      const sel = document.createElement("option");
      sel.value = "suggestion";
      sel.selected = true;
      sel.textContent = tr("toast.suggestion", { parent: data.parent_title || tr("toast.saveAsRoot") });
      select.appendChild(sel);
      state.suggestion = data;
      text.textContent = data.parent_title
        ? tr("toast.suggestsUnder", { parent: data.parent_title, reason: data.reason || "" })
        : tr("toast.suggestsRoot", { reason: data.reason || "" });
      const saveBtn = $("btn-save-suggestion");
      saveBtn.textContent = data.parent_title
        ? tr("toast.saveUnder", { parent: data.parent_title })
        : tr("toast.saveAsRoot");
      saveBtn.classList.remove("hidden");
    } catch (err) {
      // suggestion is a nicety — hide quietly on failure
      bar.classList.add("hidden");
    }
  }

  // ------------------------------------------------------------- modal

  function openModal(title, bodyHtml, handlers) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalOverlay.classList.remove("hidden");
    const close = () => {
      modalOverlay.classList.add("hidden");
      modalBody.innerHTML = "";
      handlers && handlers.cleanup && handlers.cleanup();
    };
    $("modal-close").onclick = close;
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) close(); };
    return { close, body: modalBody };
  }

  function newThoughtModal(parentThought) {
    const heading = parentThought
      ? tr("modal.newChildOf", { title: short(parentThought.title) })
      : tr("modal.newThought");
    const m = openModal(heading, `
      <div class="form-row">
        <label>${tr("prompt.title")}</label>
        <input type="text" id="m-title" autofocus />
      </div>
      <div class="form-row">
        <label>${tr("prompt.content")}</label>
        <textarea id="m-content" rows="5"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="m-save">${tr("btn.create")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#m-title").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) m.body.querySelector("#m-save").click();
    });
    m.body.querySelector("#m-save").onclick = async () => {
      const title = m.body.querySelector("#m-title").value.trim();
      if (!title) return;
      const content = m.body.querySelector("#m-content").value;
      const parentIds = parentThought ? [parentThought.id] : [];
      try {
        const created = await createThought({ title, content, parent_ids: parentIds, source: "manual" });
        if (!created) return; // duplicate — keep the modal open so the user can rename
        await refreshGraph();
        selectThought(created.id);
        m.close();
      } catch (err) { alert(err.message); }
    };
  }

  function editThoughtModal(t) {
    // In Română mode, edit the Romanian fields; in English mode, the English ones.
    const ro = isRo();
    const title = ro ? (t.title_ro || t.title) : t.title;
    const content = ro ? (t.content_ro || t.content) : t.content;
    const m = openModal(ro ? tr("modal.editThoughtRo") : tr("modal.editThought"), `
      <div class="form-row"><label>${tr("prompt.title")}</label><input type="text" id="m-title" value="${escAttr(title)}" /></div>
      <div class="form-row"><label>${tr("prompt.content")}</label><textarea id="m-content" rows="6">${escHtml(content)}</textarea></div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="m-save">${tr("btn.save")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#m-save").onclick = async () => {
      const newTitle = m.body.querySelector("#m-title").value.trim();
      const newContent = m.body.querySelector("#m-content").value;
      try {
        const body = ro
          ? { title_ro: newTitle || (t.title_ro || t.title), content_ro: newContent }
          : { title: newTitle || t.title, content: newContent };
        await put("/api/thoughts/" + t.id, body);
        await refreshGraph();
        selectThought(t.id);
        loadThoughtDetail(t.id);
        m.close();
      } catch (err) { alert(err.message); }
    };
  }

  async function extractIdeas() {
    const t = state.selectedThought;
    if (!t) return;
    const btn = $("btn-extract");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.extracting");
    try {
      const data = await post("/api/thoughts/" + t.id + "/extract", {});
      const ideas = data.ideas || [];
      if (ideas.length === 0) {
        toast(tr("toast.noIdeas"));
        return;
      }
      showExtractPicker(t, ideas);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function showExtractPicker(parent, ideas) {
    const rows = ideas.map((idea, i) => `
      <label class="idea-row">
        <input type="checkbox" data-i="${i}" checked />
        <span class="idea-text">
          <span class="idea-title">${escHtml(idea.title)}</span>
          <span class="idea-summary">${escHtml(idea.summary || "")}</span>
        </span>
      </label>
    `).join("");
    const m = openModal(tr("modal.extractedIdeas") + short(parent.title, 30) + "”", `
      <p class="form-hint" style="margin-top:0">${tr("toast.selectIdeaHint")}</p>
      <div class="idea-list">${rows}</div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="m-add">${tr("btn.addSelected")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#m-add").onclick = async () => {
      const checked = [...m.body.querySelectorAll("input[type=checkbox]:checked")]
        .map((cb) => ideas[Number(cb.dataset.i)]);
      if (checked.length === 0) {
        toast(tr("toast.selectIdea"));
        return;
      }
      try {
        let added = 0;
        let skipped = 0;
        for (const idea of checked) {
          const created = await createThought({
            title: idea.title,
            content: idea.summary || "",
            parent_ids: [parent.id],
            source: "extract",
          });
          if (created) added++;
          else skipped++;
        }
        await refreshGraph();
        selectThought(parent.id);
        m.close();
        const msg = tr("toast.addedChild", { n: added, s: added !== 1 ? "s" : "" }) +
          (skipped ? tr("toast.addedSkipped", { n: skipped }) : "");
        toast(msg);
      } catch (err) {
        toast(err.message);
      }
    };
  }

  // ------------------------------------------------------ generate related

  async function generateRelated() {
    const sel = state.selectedThought;
    if (!sel) return;
    // The graph/outline selection only has the bare node; fetch the full detail
    // so we know whether this thought has parents (for the siblings option).
    let t;
    try {
      t = await api("/api/thoughts/" + sel.id);
    } catch (err) {
      toast(err.message);
      return;
    }
    const hasParent = t.parents && t.parents.length > 0;
    const rows = [
      { type: "children", label: tr("rel.children"), hint: tr("rel.childrenHint") },
      { type: "siblings", label: tr("rel.siblings"), hint: hasParent ? tr("rel.siblingsHint") : tr("rel.siblingsNoParent"), disabled: !hasParent },
      { type: "parents", label: tr("rel.parents"), hint: tr("rel.parentsHint") },
    ].map((r) => `
      <label class="idea-row clickable${r.disabled ? " disabled-row" : ""}" data-type="${r.type}">
        <span class="idea-text">
          <span class="idea-title">${r.label}</span>
          <span class="idea-summary">${r.hint}</span>
        </span>
      </label>
    `).join("");

    const m = openModal(tr("rel.modalTitle", { title: short(t.title, 30) }), `
      <div class="idea-list">${rows}</div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelectorAll(".idea-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const rtype = row.dataset.type;
        m.close();
        const btn = $("btn-generate");
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = tr("btn.generating");
        try {
          const data = await post("/api/thoughts/" + t.id + "/generate-related", { type: rtype });
          const ideas = data.ideas || [];
          if (ideas.length === 0) {
            toast(tr("toast.noRelated"));
            return;
          }
          showGeneratedPicker(t, rtype, ideas);
        } catch (err) {
          toast(err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  }

  function showGeneratedPicker(selected, rtype, ideas) {
    const rows = ideas.map((idea, i) => `
      <label class="idea-row">
        <input type="checkbox" data-i="${i}" checked />
        <span class="idea-text">
          <span class="idea-title">${escHtml(idea.title)}</span>
          <span class="idea-summary">${escHtml(idea.summary || "")}</span>
        </span>
      </label>
    `).join("");
    const m = openModal(tr("modal.generatedRelated") + tr("rel." + rtype + "Short"), `
      <p class="form-hint" style="margin-top:0">${tr("rel.selectHint")}</p>
      <div class="idea-list">${rows}</div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="m-add">${tr("btn.addSelected")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#m-add").onclick = async () => {
      const checked = [...m.body.querySelectorAll("input[type=checkbox]:checked")]
        .map((cb) => ideas[Number(cb.dataset.i)]);
      if (checked.length === 0) {
        toast(tr("toast.selectThought"));
        return;
      }
      try {
        let added = 0;
        let skipped = 0;
        for (const idea of checked) {
          let created;
          if (rtype === "children") {
            created = await createThought({ title: idea.title, content: idea.summary || "", parent_ids: [selected.id], source: "generated" });
          } else if (rtype === "siblings") {
            created = await createThought({ title: idea.title, content: idea.summary || "", parent_ids: [selected.parents[0].id], source: "generated" });
          } else {
            created = await createThought({ title: idea.title, content: idea.summary || "", parent_ids: [], source: "generated" });
            if (created) await post("/api/links", { parent_id: created.id, child_id: selected.id });
          }
          if (created) added++;
          else skipped++;
        }
        await refreshGraph();
        selectThought(selected.id);
        m.close();
        toast(tr("toast.addedThought", { n: added, s: added !== 1 ? "s" : "" }) +
          (skipped ? tr("toast.addedSkipped", { n: skipped }) : ""));
      } catch (err) {
        toast(err.message);
      }
    };
  }

  // ------------------------------------------------------ improve title

  async function improveTitle() {
    const t = state.selectedThought;
    if (!t) return;
    const btn = $("btn-improve-title");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.thinking");
    try {
      const data = await post("/api/thoughts/" + t.id + "/suggest-title", {});
      const suggestions = data.suggestions || [];
      if (suggestions.length === 0) {
        toast(tr("toast.noTitleSuggestions"));
        return;
      }
      const m = openModal(tr("modal.improveTitle"), `
        <p class="form-hint" style="margin-top:0">
          ${tr("pick.currentTitle")}: <strong>${escHtml(t.title)}</strong>
        </p>
        <div class="idea-list">
          ${suggestions.map((s, i) => `
            <label class="idea-row clickable" data-i="${i}">
              <span class="idea-text">
                <span class="idea-title">${escHtml(s.title)}</span>
                <span class="idea-summary">${escHtml(s.reason || "")}</span>
              </span>
            </label>
          `).join("")}
        </div>
        <div class="form-actions">
          <button class="btn" data-close>${tr("btn.keepOriginal")}</button>
        </div>
      `);
      m.body.querySelectorAll(".idea-row").forEach((row) => {
        row.addEventListener("click", async () => {
          const s = suggestions[Number(row.dataset.i)];
          try {
            // In Română mode the suggestion is the Romanian title — store it as title_ro,
            // keeping the English title for the other language mode.
            const body = isRo() ? { title_ro: s.title } : { title: s.title };
            await put("/api/thoughts/" + t.id, body);
            await refreshGraph();
            selectThought(t.id);
            m.close();
            toast(tr("toast.titleUpdated", { title: s.title }));
          } catch (err) {
            toast(err.message);
          }
        });
      });
      m.body.querySelector("[data-close]").onclick = m.close;
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  // ------------------------------------------------- reanalyze children

  async function reanalyzeChildren() {
    const t = state.selectedThought;
    if (!t) return;
    const btn = $("btn-reanalyze");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.analyzing");
    try {
      const data = await post("/api/thoughts/" + t.id + "/reanalyze", {});
      showReanalyzeModal(t, data.misplaced || [], data.new_children || []);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function showReanalyzeModal(parent, misplaced, newChildren) {
    const section = (title, rowsHtml, emptyText) => `
      <div class="detail-section">
        <h3>${title}</h3>
        <div class="conn-list">
          ${rowsHtml || `<span class="conn-empty">${emptyText}</span>`}
        </div>
      </div>
    `;

    const misplacedRows = misplaced.map((c, i) => `
      <div class="conn-row" data-i="${i}" data-kind="moved">
        <div class="conn-text">
          <span class="conn-title">${tr("toast.moveUnder", { child: escHtml(titleById(c.child_id)), parent: escHtml(titleById(c.suggested_parent_id)) })}</span>
          <span class="conn-reason">${escHtml(c.reason || "")}</span>
        </div>
        <div class="conn-actions">
          <button class="btn primary conn-apply" data-kind="moved" data-i="${i}">${tr("btn.apply")}</button>
          <button class="btn conn-skip" data-i="${i}">${tr("btn.skip")}</button>
        </div>
      </div>
    `).join("");

    const newRows = newChildren.map((c, i) => `
      <div class="conn-row" data-i="${i}" data-kind="new">
        <div class="conn-text">
          <span class="conn-title">${tr("toast.addAsChild", { title: escHtml(titleById(c.child_id)) })}</span>
          <span class="conn-reason">${escHtml(c.reason || "")}</span>
        </div>
        <div class="conn-actions">
          <button class="btn primary conn-apply" data-kind="new" data-i="${i}">${tr("btn.apply")}</button>
          <button class="btn conn-skip" data-i="${i}">${tr("btn.skip")}</button>
        </div>
      </div>
    `).join("");

    const m = openModal(tr("modal.reanalyze") + short(parent.title, 30) + "”", `
      ${section(tr("re.misplaced"), misplacedRows, tr("re.misplacedNone"))}
      ${section(tr("re.suggested"), newRows, tr("re.none"))}
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.done")}</button>
        <button class="btn primary" id="m-apply-all">${tr("toast.applyAll")}</button>
      </div>
    `);

    const applied = new Set();
    const rows = [...m.body.querySelectorAll(".conn-row")];

    const markDone = (i) => {
      applied.add(i);
      const row = rows[i];
      row.querySelector(".conn-actions").innerHTML = '<span class="conn-applied">' + tr("btn.doneMark") + '</span>';
      row.classList.add("applied");
    };

    const applyOne = async (i) => {
      const row = rows[i];
      const kind = row.dataset.kind;
      try {
        if (kind === "moved") {
          const c = misplaced[Number(row.dataset.i)];
          const oldLink = state.edges.find(
            (e) => e.parent_id === parent.id && e.child_id === c.child_id
          );
          if (oldLink) await del("/api/links/" + oldLink.id);
          await post("/api/links", { parent_id: c.suggested_parent_id, child_id: c.child_id });
        } else {
          const c = newChildren[Number(row.dataset.i)];
          await post("/api/links", { parent_id: parent.id, child_id: c.child_id });
        }
        markDone(i);
        await refreshGraph();
      } catch (err) {
        toast(err.message);
      }
    };

    m.body.querySelectorAll(".conn-apply").forEach((btn) => {
      btn.onclick = () => applyOne(Number(btn.dataset.i));
    });
    m.body.querySelectorAll(".conn-skip").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.i);
        if (!applied.has(i)) rows[i].style.display = "none";
      };
    });
    m.body.querySelector("#m-apply-all").onclick = async () => {
      m.body.querySelector("#m-apply-all").disabled = true;
      for (let i = 0; i < rows.length; i++) {
        if (!applied.has(i)) await applyOne(i);
      }
      m.body.querySelector("#m-apply-all").disabled = false;
      m.body.querySelector("#m-apply-all").textContent = tr("btn.doneApplied");
    };
    m.body.querySelector("[data-close]").onclick = m.close;
  }

  // ------------------------------------------------------ find connections

  async function findConnections() {
    const btn = $("btn-connections");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.searching");
    try {
      const data = await post("/api/connections", {});
      const list = data.connections || [];
      if (list.length === 0) {
        toast(tr("toast.noConnections"));
        return;
      }
      showConnectionsModal(list);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function showConnectionsModal(list) {
    const m = openModal(tr("conn.new"), `
      <p class="form-hint" style="margin-top:0">
        ${tr("conn.foundHint", { n: list.length, s: list.length > 1 ? "s" : "" })}
      </p>
      <div class="conn-list">
        ${list.map((c, i) => `
          <div class="conn-row" data-i="${i}">
            <div class="conn-text">
              <span class="conn-title">${tr("toast.linkUnder", { title: escHtml(titleById(c.child_id)), parent: escHtml(titleById(c.parent_id)) })}</span>
              <span class="conn-reason">${escHtml(c.reason || "")}</span>
            </div>
            <div class="conn-actions">
              <button class="btn primary conn-apply" data-i="${i}">${tr("btn.apply")}</button>
              <button class="btn conn-skip" data-i="${i}">${tr("btn.skip")}</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.done")}</button>
        <button class="btn primary" id="m-apply-all">${tr("toast.applyAll")}</button>
      </div>
    `);

    const applied = new Set();
    const rows = [...m.body.querySelectorAll(".conn-row")];

    const markApplied = (i) => {
      applied.add(i);
      const row = rows[i];
      row.querySelector(".conn-actions").innerHTML = '<span class="conn-applied">' + tr("conn.linkedMark") + '</span>';
      row.classList.add("applied");
    };

    const applyOne = async (i) => {
      const c = list[i];
      try {
        await post("/api/links", { parent_id: c.parent_id, child_id: c.child_id });
        markApplied(i);
        await refreshGraph();
        toast(tr("toast.linked", { child: titleById(c.child_id), parent: titleById(c.parent_id) }));
      } catch (err) {
        toast(err.message);
      }
    };

    m.body.querySelectorAll(".conn-apply").forEach((btn) => {
      btn.onclick = () => applyOne(Number(btn.dataset.i));
    });
    m.body.querySelectorAll(".conn-skip").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.i);
        if (!applied.has(i)) rows[i].style.display = "none";
      };
    });
    m.body.querySelector("#m-apply-all").onclick = async () => {
      m.body.querySelector("#m-apply-all").disabled = true;
      for (let i = 0; i < list.length; i++) {
        if (!applied.has(i)) await applyOne(i);
      }
      m.body.querySelector("#m-apply-all").disabled = false;
      m.body.querySelector("#m-apply-all").textContent = tr("btn.doneApplied");
    };
    m.body.querySelector("[data-close]").onclick = m.close;
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  const COPY_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  function copyButton(title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = COPY_ICON;
    return btn;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); }
      finally { document.body.removeChild(ta); }
    }
    toast(tr("toast.copied"));
  }

  function flashCopied(btn) {
    btn.classList.add("copied");
    clearTimeout(btn._copiedTimer);
    btn._copiedTimer = setTimeout(() => btn.classList.remove("copied"), 1200);
  }

  function settingsModal() {
    const s = state.settings || {};
    const m = openModal(tr("modal.settings"), `
      <div class="form-row">
        <label>${tr("settings.apiKey")}</label>
        <input type="text" id="s-key" placeholder="sk-…" value="${escAttr(s.api_key || "")}" />
        <div class="form-hint">${s.api_key_set ? tr("settings.keyConfigured") : tr("settings.getKey")}</div>
      </div>
      <div class="form-row"><label>${tr("settings.model")}</label><input type="text" id="s-model" value="${escAttr(s.model || "deepseek-v4-flash")}" /></div>
      <div class="form-row"><label>${tr("settings.temperature")}</label><input type="number" id="s-temp" step="0.1" min="0" max="2" value="${escAttr(s.temperature ?? "1.0")}" /></div>
      <div class="form-row"><label>${tr("settings.baseUrl")}</label><input type="text" id="s-base" value="${escAttr(s.base_url || "https://api.deepseek.com")}" /></div>
      <div class="form-row checkbox">
        <input type="checkbox" id="s-thinking" ${s.thinking === "true" ? "checked" : ""} />
        <label for="s-thinking">${tr("settings.thinking")}</label>
      </div>
      <div class="form-row">
        <label>${tr("settings.language")}</label>
        <select id="s-language">
          <option value="en" ${s.language !== "ro" ? "selected" : ""}>English</option>
          <option value="ro" ${s.language === "ro" ? "selected" : ""}>Română</option>
        </select>
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="s-save">${tr("btn.save")}</button>
      </div>
      <div class="form-row danger-zone">
        <label>${tr("settings.dangerZone")}</label>
        <button class="btn danger" id="s-clear-kb">${tr("settings.clearKb")}</button>
        <div class="form-hint">${tr("settings.clearKbHint")}</div>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#s-clear-kb").onclick = async () => {
      const kbName = $("kb-select").value;
      confirmByTyping(
        tr("kb.clearConfirm", { name: kbName }),
        kbName,
        async () => {
          await post("/api/kbs/clear", {});
          await refreshGraph();
          selectThought(null);
          showDetail(null);
          m.close();
          toast(tr("toast.kbCleared"));
        }
      );
    };
    m.body.querySelector("#s-save").onclick = async () => {
      try {
        await put("/api/settings", {
          api_key: m.body.querySelector("#s-key").value.trim(),
          model: m.body.querySelector("#s-model").value.trim(),
          temperature: m.body.querySelector("#s-temp").value,
          base_url: m.body.querySelector("#s-base").value.trim(),
          thinking: m.body.querySelector("#s-thinking").checked ? "true" : "false",
          language: m.body.querySelector("#s-language").value,
        });
        await loadSettings();
        applyStaticTranslations();
        m.close();
        await refreshGraph();
        const cur = state.selectedThought;
        if (cur) loadThoughtDetail(cur.id);
      } catch (err) { alert(err.message); }
    };
  }

  // ------------------------------------------------------ generate content

  async function generateContent() {
    const t = state.selectedThought;
    if (!t) return;
    const btn = $("btn-gen-content");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.generating");
    try {
      const data = await post("/api/thoughts/" + t.id + "/generate-content", {});
      showGeneratedContent(t, data);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function showGeneratedContent(thought, initial) {
    let current = initial;
    const m = openModal(tr("modal.generatedContent") + short(thought.title, 40) + "”", `
      <div class="form-row">
        <div class="gen-content">${escHtml(current.content_en)}</div>
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn" id="m-regen">${tr("btn.regenerate")}</button>
        <button class="btn primary" id="m-use">${tr("btn.useContent")}</button>
      </div>
    `);

    const preview = () => m.body.querySelector(".gen-content");
    const regenBtn = m.body.querySelector("#m-regen");
    const useBtn = m.body.querySelector("#m-use");

    m.body.querySelector("[data-close]").onclick = m.close;

    regenBtn.onclick = async () => {
      regenBtn.disabled = true;
      regenBtn.textContent = tr("btn.regenerating");
      preview().textContent = tr("btn.generating");
      try {
        const data = await post("/api/thoughts/" + thought.id + "/generate-content", {});
        current = data;
        preview().textContent = current.content_en;
      } catch (err) {
        toast(err.message);
      } finally {
        regenBtn.disabled = false;
        regenBtn.textContent = tr("btn.regenerate");
      }
    };

    useBtn.onclick = async () => {
      useBtn.disabled = true;
      try {
        await put("/api/thoughts/" + thought.id, {
          content: current.content_en,
          content_ro: current.content_ro,
        });
        m.close();
        loadThoughtDetail(thought.id);
        toast(tr("toast.contentUpdated"));
      } catch (err) {
        toast(err.message);
        useBtn.disabled = false;
      }
    };
  }

  // -------------------------------------------------------- translate / followups

  async function translateTitles() {
    const btn = $("btn-translate-titles");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.translating");
    try {
      const data = await post("/api/translate-titles", {});
      await refreshGraph();
      const cur = state.selectedThought;
      if (cur) loadThoughtDetail(cur.id);
      toast(data.updated > 0
        ? tr("toast.translatedTitle", { n: data.updated, s: data.updated !== 1 ? "s" : "" })
        : tr("toast.allTranslated"));
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function translateContent() {
    const btn = $("btn-translate-content");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.translating");
    try {
      const data = await post("/api/translate-content", {});
      await refreshGraph();
      const cur = state.selectedThought;
      if (cur) loadThoughtDetail(cur.id);
      toast(data.updated > 0
        ? tr("toast.translatedDetail", { n: data.updated, s: data.updated !== 1 ? "s" : "" })
        : tr("toast.allDetailsTranslated"));
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  let followupTimer = null;
  function loadFollowups() {
    clearTimeout(followupTimer);
    const box = $("followups");
    const ctx = state.selectedThought;
    if (!ctx) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = '<span class="followup-hint">' + tr("followups.hint") + '</span>';
    followupTimer = setTimeout(async () => {
      try {
        const data = await post("/api/thoughts/" + ctx.id + "/followups", {});
        if (!state.selectedThought || state.selectedThought.id !== ctx.id) return;
        const groupDefs = [
          { key: "scientific", label: tr("qtype.scientific") },
          { key: "practical", label: tr("qtype.practical") },
          { key: "comparative", label: tr("qtype.comparative") },
          { key: "historical", label: tr("qtype.historical") },
          { key: "causal", label: tr("qtype.causal") },
          { key: "critical", label: tr("qtype.critical") },
        ];
        const groupHtml = (label, qs, qtype) => qs.length ? (
          '<div class="followup-group">' +
          '<span class="followup-label">' + escHtml(label) + "</span>" +
          qs.map((q) => '<button class="chip" data-type="' + qtype + '">' + escHtml(q) + "</button>").join("") +
          "</div>"
        ) : "";
        const html = groupDefs
          .map((g) => groupHtml(g.label, data[g.key] || [], g.key))
          .join("");
        if (!html) {
          box.classList.add("hidden");
          box.innerHTML = "";
          return;
        }
        box.innerHTML = html;
        box.querySelectorAll(".chip").forEach((chip) => {
          chip.addEventListener("click", () => {
            state.pendingQuestionType = chip.dataset.type || null;
            promptInput.value = chip.textContent;
            promptInput.focus();
          });
        });
      } catch (e) {
        box.classList.add("hidden");
        box.innerHTML = "";
      }
    }, 600);
  }

  // ------------------------------------------------------------- data

  async function loadSettings() {
    try {
      state.settings = await api("/api/settings");
      chatStatus.classList.toggle("ok", state.settings.api_key_set);
      chatStatus.classList.toggle("err", !state.settings.api_key_set);
      chatStatus.title = state.settings.api_key_set
        ? "API key configured"
        : "No API key configured — add it in Settings or .env";
    } catch (e) {
      chatStatus.classList.add("err");
    }
  }

  async function refreshGraph() {
    const data = await api("/api/graph");
    state.thoughts = data.nodes;
    state.edges = data.edges;
    renderGraph();
    if (state.viewMode === "outline") renderOutline();
  }

  // ------------------------------------------------------------- search

  let searchTimer = null;
  let searchSeq = 0;

  function hideSearchResults() {
    $("search-results").classList.add("hidden");
  }

  function escRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function runSearch() {
    const q = $("search-input").value.trim();
    const mode = $("search-mode").value;
    const resultsEl = $("search-results");
    const seq = ++searchSeq;
    if (!q) {
      clearTimeout(searchTimer);
      hideSearchResults();
      return;
    }
    resultsEl.classList.remove("hidden");
    if (mode === "exact") {
      clearTimeout(searchTimer);
      resultsEl.innerHTML = '<div class="search-note">' + tr("search.note") + '</div>';
      searchTimer = setTimeout(async () => {
        try {
          const data = await api("/api/search?q=" + encodeURIComponent(q));
          if (seq !== searchSeq) return;
          renderSearchResults(data.results || [], "exact", q);
        } catch (err) {
          if (seq === searchSeq) {
            resultsEl.innerHTML = '<div class="search-note">' + escHtml(err.message) + "</div>";
          }
        }
      }, 250);
    } else {
      clearTimeout(searchTimer);
      resultsEl.innerHTML = '<div class="search-note">' + tr("search.aiNote") + '</div>';
      post("/api/search/semantic", { query: q }).then((data) => {
        if (seq !== searchSeq) return;
        renderSearchResults(data.results || [], "ai");
      }).catch((err) => {
        if (seq === searchSeq) {
          resultsEl.innerHTML = '<div class="search-note">' + escHtml(err.message) + "</div>";
        }
      });
    }
  }

  function snippetWithHighlight(content, q) {
    const idx = content.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return escHtml(content.slice(0, 120));
    const start = Math.max(0, idx - 30);
    const end = Math.min(content.length, idx + q.length + 60);
    const before = (start > 0 ? "…" : "") + escHtml(content.slice(start, idx));
    const hit = "<mark>" + escHtml(content.slice(idx, idx + q.length)) + "</mark>";
    const after = escHtml(content.slice(idx + q.length, end)) + (end < content.length ? "…" : "");
    return before + hit + after;
  }

  function renderSearchResults(list, mode, q) {
    const resultsEl = $("search-results");
    if (list.length === 0) {
      resultsEl.innerHTML = '<div class="search-note">' + tr("search.noResults") + '</div>';
      return;
    }
    const rows = list.map((r) => {
      const title = fmtTitle(r);
      const sub = mode === "ai"
        ? '<div class="reason">' + escHtml(r.reason || "") + "</div>"
        : '<div class="reason">' + snippetWithHighlight(r.content_ro || r.content || "", q || "") + "</div>";
      return '<div class="search-row" data-id="' + r.id + '">' +
        '<div class="s-title">' + escHtml(title) + "</div>" + sub + "</div>";
    }).join("");
    resultsEl.innerHTML = '<div class="search-count">' + tr("search.count", { n: list.length, s: list.length !== 1 ? "s" : "" }) + "</div>" + rows;
    resultsEl.querySelectorAll(".search-row").forEach((row) => {
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectThought(Number(row.dataset.id));
        hideSearchResults();
        $("search-input").blur();
      });
    });
  }

  // -------------------------------------------------------------- stats

  // One stats row with a colored dot, label, count, and an info icon whose
  // tooltip explains what the type means.
  function statRowHtml(color, label, count, desc) {
    return `
      <div class="stat-row">
        <span class="stat-dot" style="background:${color}"></span>
        <span class="stat-label">${escHtml(label)}
          ${desc ? `<span class="stat-info" tabindex="0" aria-label="Info about ${escAttr(label)}">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
              <line x1="8" y1="7.5" x2="8" y2="11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <circle cx="8" cy="5" r="1" fill="currentColor"/>
            </svg>
            <span class="stat-tip" role="tooltip">${escHtml(desc)}</span>
          </span>` : ""}
        </span>
        <span class="stat-count">${count}</span>
      </div>
    `;
  }

  async function showStats() {
    let data;
    try {
      data = await api("/api/stats");
    } catch (err) {
      toast(err.message);
      return;
    }
    const by = data.by_source || {};
    const order = ["prompt", "generated", "extract", "manual", "unknown"];
    const rows = order
      .filter((k) => by[k])
      .map((k) => statRowHtml(sourceColor(k), sourceLabel(k), by[k], sourceDesc(k)))
      .join("");

    // Follow-up question types (incl. "Untyped" for thoughts without one).
    const qtypeOrder = ["scientific", "practical", "comparative", "historical", "causal", "critical", "untyped"];
    const byQ = data.by_question_type || {};
    const qtypeRows = qtypeOrder
      .filter((k) => byQ[k])
      .map((k) => statRowHtml(qtypeColor(k), qtypeLabel(k), byQ[k], qtypeDesc(k)))
      .join("");

    const body = data.total === 0
      ? '<div class="search-note">' + tr("stats.noThoughts") + '</div>'
      : `<div class="stat-total">${tr("stats.total")}<strong>${data.total}</strong></div>`
        + `<div class="stat-section">${tr("stats.sectionThought")}</div>${rows}`
        + `<div class="stat-section">${tr("stats.sectionQuestion")}</div>${qtypeRows}`;

    const m = openModal(tr("modal.statistics"), `
      <div class="stat-body">${body}</div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.close")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
  }

  // ------------------------------------------------------- knowledge bases

  async function loadKbList() {
    const data = await api("/api/kbs");
    const sel = $("kb-select");
    sel.innerHTML = data.bases.map((b) =>
      `<option value="${escAttr(b)}" ${b === data.current ? "selected" : ""}>${escHtml(b)}</option>`
    ).join("");
    return data;
  }

  async function switchKb(name) {
    try {
      await put("/api/kbs/current", { name });
      state.chatHistory = [];
      chatMessages.innerHTML = "";
      $("save-row").classList.add("hidden");
      resetSuggestion();
      document.getElementById("prompt-input").value = "";
      await loadKbList();
      await loadSettings();
      await refreshGraph();
      selectThought(null);
      showDetail(null);
      toast(tr("toast.switched", { name: name }));
    } catch (err) { toast(err.message); }
  }

  function kbNameModal(title, placeholder, actionLabel, onOk) {
    const m = openModal(title, `
      <div class="form-row">
        <label>${tr("kb.name")}</label>
        <input type="text" id="kb-name" placeholder="${escAttr(placeholder)}" />
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="kb-ok">${actionLabel}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#kb-ok").onclick = async () => {
      const name = m.body.querySelector("#kb-name").value.trim();
      if (!name) return;
      try {
        await onOk(name);
        m.close();
      } catch (err) { alert(err.message); }
    };
  }

  function confirmByTyping(message, expected, onYes) {
    const m = openModal(tr("kb.confirm"), `
      <p class="form-hint" style="margin-top:0">${message}</p>
      <div class="form-row">
        <label>${tr("kb.typeToConfirm")}</label>
        <input type="text" id="kb-confirm" />
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn danger" id="kb-confirm-ok">${tr("btn.delete")}</button>
      </div>
    `);
    const input = m.body.querySelector("#kb-confirm");
    const okBtn = m.body.querySelector("#kb-confirm-ok");
    okBtn.disabled = true;
    input.addEventListener("input", () => { okBtn.disabled = input.value !== expected; });
    m.body.querySelector("[data-close]").onclick = m.close;
    okBtn.onclick = async () => {
      if (input.value !== expected) return;
      try {
        await onYes();
        m.close();
      } catch (err) { toast(err.message); }
    };
  }

  // ------------------------------------------------------------- events

  $("btn-new-thought").onclick = () => newThoughtModal(null);
  $("btn-empty-new").onclick = () => newThoughtModal(null);
  $("btn-add-child").onclick = () => {
    if (state.selectedThought) newThoughtModal(state.selectedThought);
  };
  $("btn-add-sibling").onclick = () => {
    if (!state.selectedThought) return;
    const parent = state.selectedThought.parents[0];
    newThoughtModal(parent || { title: "", id: null });
  };
  $("btn-edit-thought").onclick = () => {
    if (state.selectedThought) editThoughtModal(state.selectedThought);
  };
  $("btn-copy-title").onclick = () => {
    const t = state.selectedThought;
    if (!t) return;
    copyText(fmtTitle(t));
    flashCopied($("btn-copy-title"));
  };
  $("btn-copy-content").onclick = () => {
    const t = state.selectedThought;
    if (!t) return;
    copyText(displayContent(t) || "");
    flashCopied($("btn-copy-content"));
  };
  $("btn-extract").onclick = extractIdeas;
  $("btn-generate").onclick = generateRelated;
  $("btn-improve-title").onclick = improveTitle;
  $("btn-gen-content").onclick = generateContent;
  $("btn-reanalyze").onclick = reanalyzeChildren;

  $("btn-delete-thought").onclick = async () => {
    const t = state.selectedThought;
    if (!t) return;
    const hasChildren = t.children && t.children.length > 0;
    const msg = hasChildren
      ? tr("confirm.deleteCascade", { title: short(t.title) })
      : tr("confirm.delete", { title: short(t.title) });
    if (!confirm(msg)) return;
    try {
      await del("/api/thoughts/" + t.id + (hasChildren ? "?cascade=true" : ""));
      await refreshGraph();
      detailEmpty.classList.remove("hidden");
      detailBody.classList.add("hidden");
    } catch (err) { alert(err.message); }
  };

  $("btn-link").onclick = async () => {
    const sel = getSelectedThoughts();
    if (sel.length !== 2) return;
    const [a, b] = sel;
    try {
      await post("/api/links", { parent_id: a.id, child_id: b.id });
      await refreshGraph();
    } catch (err) { alert(err.message); }
  };

  $("layout-select").addEventListener("change", (e) => {
    if (state.thoughts.length === 0) return;
    if (e.target.value === "mindmap") {
      recenterMindmap(); // handles layout + readable zoom/center
    } else {
      cy.layout(layoutOptions(e.target.value)).run();
    }
  });

  $("btn-view-graph").onclick = () => setView("graph");
  $("btn-view-outline").onclick = () => setView("outline");
  $("btn-connections").onclick = findConnections;
  $("btn-translate-titles").onclick = translateTitles;
  $("btn-translate-content").onclick = translateContent;
  $("btn-comment-add").onclick = addComment;
  $("comment-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addComment();
  });

  $("btn-send").onclick = sendChat;
  ctxEnabled.addEventListener("change", updateSelectionUI);
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  $("btn-save-response").onclick = () => saveResponseAsThought();
  $("btn-save-suggestion").onclick = () => saveResponseAsThought("suggestion");
  $("btn-export-chat").onclick = exportChatMd;
  $("btn-save-prompt").onclick = async () => {
    const last = state.chatHistory.find((m) => m.role === "user");
    if (!last) return;
    const parentIds = [];
    if (state.selectedThought) parentIds.push(state.selectedThought.id);
    try {
      const created = await createThought({
        title: autoTitle(last.content),
        content: last.content,
        source: "prompt",
        parent_ids: parentIds,
      });
      if (!created) return; // duplicate — already selected the existing one
      await refreshGraph();
      selectThought(created.id);
    } catch (err) { alert(err.message); }
  };

  $("btn-settings").onclick = settingsModal;

  $("search-input").addEventListener("input", runSearch);
  $("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = $("search-input").value.trim();
      if (q) runSearch();
    }
    if (e.key === "Escape") hideSearchResults();
  });
  $("search-mode").addEventListener("change", () => {
    if ($("search-input").value.trim()) runSearch();
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".search-group")) hideSearchResults();
  });

  $("kb-select").addEventListener("change", (e) => {
    if (e.target.value) switchKb(e.target.value);
  });
  $("btn-kb-new").onclick = () => kbNameModal(tr("kb.newTitle"), "My Knowledge Base", tr("btn.create"), async (name) => {
    await post("/api/kbs", { name });
    state.chatHistory = [];
    chatMessages.innerHTML = "";
    $("save-row").classList.add("hidden");
    resetSuggestion();
    await loadKbList();
    await loadSettings();
    await refreshGraph();
    selectThought(null);
    showDetail(null);
    toast(tr("toast.created", { name: name }));
  });
  $("btn-kb-rename").onclick = async () => {
    const data = await loadKbList();
    const current = $("kb-select").value;
    kbNameModal(tr("kb.renameTitle"), current, tr("kb.rename"), async (newName) => {
      await post("/api/kbs/" + encodeURIComponent(current) + "/rename", { name: newName });
      await loadKbList();
      toast(tr("toast.renamed", { name: newName }));
    });
  };
  $("btn-kb-delete").onclick = async () => {
    const data = await loadKbList();
    const current = $("kb-select").value;
    confirmByTyping(
      tr("kb.deleteConfirm", { name: escHtml(current) }),
      current,
      async () => {
        await del("/api/kbs/" + encodeURIComponent(current));
        await loadKbList();
        await loadSettings();
        await refreshGraph();
        selectThought(null);
        showDetail(null);
        toast(tr("toast.deleted"));
      }
    );
  };

  $("btn-stats").onclick = showStats;
  $("btn-export").onclick = async () => {
    try {
      const data = await api("/api/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "knowledge-brain-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
  };

  $("btn-import").onclick = () => $("import-file").click();
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(tr("import.confirm"))) {
      e.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await post("/api/import", data);
      await refreshGraph();
      detailEmpty.classList.remove("hidden");
      detailBody.classList.add("hidden");
    } catch (err) {
      alert(tr("import.failed") + ": " + err.message);
    }
    e.target.value = "";
  });

  // ------------------------------------------------------------- helpers

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return escHtml(s).replace(/"/g, "&quot;");
  }

  // ------------------------------------------------------------- resize

  const PANEL_MIN = 220;
  const PANEL_MAX = 483;
  const PANEL_STORAGE_KEY = "kb.panelWidths";

  function clampWidth(w) {
    return Math.min(PANEL_MAX, Math.max(PANEL_MIN, w));
  }

  function savePanelWidths() {
    const root = getComputedStyle(document.documentElement);
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({
        left: parseFloat(root.getPropertyValue("--left-w")) || PANEL_MIN,
        right: parseFloat(root.getPropertyValue("--right-w")) || PANEL_MIN,
      }));
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function restorePanelWidths() {
    const root = document.documentElement;
    try {
      const raw = localStorage.getItem(PANEL_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.left === "number") root.style.setProperty("--left-w", clampWidth(saved.left) + "px");
      if (typeof saved.right === "number") root.style.setProperty("--right-w", clampWidth(saved.right) + "px");
    } catch (e) { /* malformed or unavailable — keep defaults */ }
  }

  function initResize() {
    const root = document.documentElement;
    restorePanelWidths();
    const handles = document.querySelectorAll(".resize-handle");
    handles.forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add("dragging");
        const side = handle.dataset.side;
        const panel = side === "left" ? $("chat-panel") : $("detail-panel");
        const startX = e.clientX;
        const startWidth = panel.getBoundingClientRect().width;
        document.body.style.userSelect = "none";

        const onMove = (ev) => {
          const delta = ev.clientX - startX;
          // The right handle sits at the panel's left edge: dragging left grows
          // it, so the sign is inverted relative to the left handle.
          const next = side === "left"
            ? startWidth + delta
            : startWidth - delta;
          const clamped = Math.min(PANEL_MAX, Math.max(PANEL_MIN, next));
          root.style.setProperty(side === "left" ? "--left-w" : "--right-w", clamped + "px");
        };
        const onUp = (ev) => {
          handle.classList.remove("dragging");
          document.body.style.userSelect = "";
          handle.releasePointerCapture(ev.pointerId);
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
          savePanelWidths();
          cy.resize();
          if (state.viewMode === "outline") renderOutline();
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      });
    });
  }

  const CHAT_MSGS_MIN = 120;
  const CHAT_MSGS_MAX = 600;
  const CHAT_MSGS_STORAGE_KEY = "kb.chatMsgsHeight";

  function initChatMsgsResize() {
    const handle = $("chat-msgs-resize");
    const messages = $("chat-messages");
    const root = document.documentElement;

    try {
      const raw = localStorage.getItem(CHAT_MSGS_STORAGE_KEY);
      const saved = raw ? parseInt(raw, 10) : NaN;
      if (!isNaN(saved)) {
        const h = Math.min(CHAT_MSGS_MAX, Math.max(CHAT_MSGS_MIN, saved));
        root.style.setProperty("--chat-msgs-max", h + "px");
      }
    } catch (e) { /* ignore */ }

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("dragging");
      document.body.style.userSelect = "none";
      const startY = e.clientY;
      const startHeight = messages.getBoundingClientRect().height;

      const onMove = (ev) => {
        // The handle sits ABOVE the messages: dragging down moves the top edge
        // down (shrinks the area), dragging up grows it.
        const h = Math.min(CHAT_MSGS_MAX, Math.max(CHAT_MSGS_MIN, startHeight - (ev.clientY - startY)));
        root.style.setProperty("--chat-msgs-max", h + "px");
      };
      const onUp = (ev) => {
        handle.classList.remove("dragging");
        document.body.style.userSelect = "";
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        try {
          localStorage.setItem(CHAT_MSGS_STORAGE_KEY, String(Math.round(messages.getBoundingClientRect().height)));
        } catch (err) { /* ignore */ }
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  // ------------------------------------------------------------- init

  loadSettings().then(applyStaticTranslations);
  loadKbList();
  initResize();
  initChatMsgsResize();
  refreshGraph().then(() => setView("outline"));
})();
