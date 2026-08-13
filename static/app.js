/* Brainforest frontend. */
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
    viewMode: "outline",  // "graph" | "outline" | "timeline" | "review"
    timelineSort: "updated", // "created" | "updated"
    reviewTab: "orphans", // "orphans" | "stale" | "disconnected"
    reviewDays: 30,
    contentPreview: true,  // detail content mode: true = rendered markdown, false = raw source
    outlineExpanded: null, // Set of expanded thought ids, or null for all-expanded
    filterSources: new Set(),  // active thought-type filters (source values)
    filterQtypes: new Set(),   // active follow-up-question-type filters
    filterAllKbs: false,       // true = graph/outline show matching thoughts from every KB
    focusMode: "off",          // "off" | "descendants" | "ancestors" | "both" (root = selectedThought)
    _lastFocusRootId: null,    // re-entrancy guard for auto-refocus
    expandNode: null,          // node id (string) or null — dim-mode root
    showMinimap: false,
    bulkSelected: new Set(),   // thought ids flagged for a bulk action (checkbox / graph multi-select)
    selectMode: false,         // when true, list rows show bulk checkboxes
  };

  // ------------------------------------------------------------- i18n

  // UI strings keyed by semantic id. "en" is the fallback; "ro" is shown when
  // the user sets Language → Română in Settings.
  const I18N = {
    en: {
      "toolbar.newThought": "＋ New thought",
      "toolbar.newThoughtTitle": "Create a new root thought (N)",
      "toolbar.link": "Link parent→child",
      "toolbar.linkTitle": "Create parent → child link between two selected thoughts",
      "toolbar.linkHint": "Link “{a}” → “{b}”?",
      "toolbar.viewGraph": "Graph",
      "toolbar.viewOutline": "Outline",
      "toolbar.viewTimeline": "Timeline",
      "toolbar.viewReview": "Review",
      "toolbar.viewTitle": "Switch between graph and outline view",
      "toolbar.select": "Select",
      "toolbar.selectTitle": "Show selection checkboxes in Outline, Timeline and Review",
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
      "toolbar.graphTools": "⋯",
      "toolbar.graphToolsTitle": "Graph tools",
      "toolbar.resetLayout": "Reset layout",
      "toolbar.resetLayoutTitle": "Clear saved positions and re-run the current layout",
      "toolbar.minimap": "Minimap",
      "toolbar.minimapTitle": "Toggle the graph minimap",
      "toolbar.theme": "Theme",
      "toolbar.themeTitle": "Switch graph theme (light / neon dark)",
      "toolbar.themeLight": "Light",
      "toolbar.themeDark": "Neon dark",
      "toolbar.searchPh": "Search…",
      "toolbar.searchModeTitle": "Search mode",
      "toolbar.searchExact": "Exact",
      "toolbar.searchSemantic": "Semantic",
      "toolbar.searchAi": "AI",
      "toolbar.searchAll": "All KBs",
      "toolbar.kb": "KB",
      "toolbar.kbTitle": "Active knowledge base",
      "toolbar.kbMore": "⋯",
      "toolbar.kbMoreTitle": "Manage knowledge bases",
      "toolbar.kbNew": "＋ New",
      "toolbar.kbNewTitle": "Create a new knowledge base",
      "toolbar.kbRename": "Rename",
      "toolbar.kbRenameTitle": "Rename the current knowledge base",
      "toolbar.kbDelete": "Delete",
      "toolbar.kbDeleteTitle": "Delete a knowledge base",
      "toolbar.navToggleTitle": "Toggle toolbar",
      "toolbar.more": "⋯ More",
      "toolbar.moreTitle": "More tools",
      "toolbar.export": "Export JSON",
      "toolbar.exportTitle": "Download knowledge base as lossless JSON",
      "toolbar.exportMarkdown": "Export Markdown",
      "toolbar.exportMdTitle": "Download knowledge base as Markdown",
      "export.done": "✓ Export downloaded",
      "toolbar.import": "Import",
      "toolbar.importTitle": "Load a knowledge base from JSON",
      "toolbar.stats": "📊 Stats",
      "toolbar.statsTitle": "Knowledge base statistics",
      "toolbar.trash": "🗑 Trash",
      "toolbar.trashTitle": "Open the recycle bin",
      "toolbar.backups": "💾 Backups",
      "toolbar.backupsTitle": "Backups and restore",
      "toolbar.shortcuts": "⌨ Keyboard shortcuts",
      "toolbar.shortcutsTitle": "Keyboard shortcuts reference",
      "shortcuts.title": "Keyboard shortcuts",
      "shortcuts.newThought": "New thought",
      "shortcuts.editThought": "Edit selected thought",
      "shortcuts.deleteThought": "Delete selected thought",
      "trash.title": "Recycle bin",
      "trash.empty": "Empty trash",
      "trash.emptyHint": "Permanently delete everything in the trash. This cannot be undone.",
      "trash.emptyDone": "✓ Trash emptied",
      "trash.emptyConfirm": "Type the number {n} to permanently empty the trash.",
      "trash.none": "The trash is empty.",
      "trash.restore": "Restore",
      "trash.restoreDone": "✓ Thought restored",
      "trash.purge": "Delete forever",
      "trash.purgeConfirm": "Permanently delete “{title}”? This cannot be undone.",
      "trash.purgeDone": "✓ Thought deleted forever",
      "trash.deletedAt": "Deleted {date}",
      "trash.purgeAllHint": "This deletes {n} thought{s} forever. They cannot be recovered.",
      "backups.title": "Backups",
      "backups.create": "Create backup now",
      "backups.createAll": "Back up all KBs",
      "backups.none": "No backups yet.",
      "backups.restore": "Restore",
      "backups.restoreConfirm": "Restore “{filename}”? Your current data will be overwritten. A safety snapshot is made first.",
      "backups.restoreDone": "✓ Backups restored",
      "backups.size": "{size}",
      "backups.createdAt": "{date}",
      "backups.backedUpAll": "✓ Backed up {n} knowledge base{s}",
      "backups.backedUp": "✓ Backup created",
      "backups.verifyWarning": "⚠ Backup created but failed its integrity check — it may not restore correctly. Check disk space and try again.",
      "toolbar.filter": "Filter",
      "toolbar.filterTitle": "Filter thoughts by type",
      "toolbar.filterCountTitle": "Active filters",
      "filter.sectionThought": "Thought types",
      "filter.sectionQuestion": "Follow-up question types",
      "filter.sectionFocus": "Focus",
      "filter.focusOff": "Off",
      "filter.focusDesc": "Descendants",
      "filter.focusAnc": "Ancestors",
      "filter.focusBoth": "Both",
      "filter.clear": "Clear",
      "filter.allKbs": "All KBs",
      "filter.allKbsTitle": "Show matching thoughts from all knowledge bases",
      "toolbar.settings": "Settings",
      "toolbar.settingsTitle": "DeepSeek settings",
      "chat.title": "DeepSeek Chat",
      "chat.statusTitle": "connection",
      "chat.contextTitle": "Include the selected thought as context in your prompt",
      "chat.useContext": "Use selected thought as context",
      "chat.contextPrefix": "Context: ",
      "chat.autoFollowups": "Auto follow-up questions",
      "chat.autoFollowupsTitle": "Auto-generate follow-up questions when you select a thought",
      "chat.saveResponse": "Save response",
      "chat.saveChild": "as child of selection",
      "chat.saveSibling": "as sibling of selection",
      "chat.saveRoot": "as a new root",
      "chat.saveAsThought": "Save as thought",
      "chat.more": "⋯",
      "chat.moreTitle": "More chat actions",
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
      "detail.ai": "✨ AI",
      "detail.aiTitle": "AI actions for this thought",
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
      "detail.suggestParents": "🔗 Suggest parents",
      "detail.suggestParentsTitle": "Ask AI to suggest parent thoughts for this thought",
      "detail.suggestRelations": "🔗 Suggest children & siblings",
      "detail.suggestRelationsTitle": "Ask AI to suggest child thoughts and sibling thoughts for this thought",
      "detail.edit": "Edit",
      "detail.history": "History",
      "detail.historyTitle": "View this thought's edit history",
      "versions.title": "Version history",
      "versions.empty": "No versions yet. Edits are recorded automatically.",
      "versions.count": "{n} versions",
      "versions.restore": "Restore",
      "versions.restoreConfirm": "Restore the version from {date}? The current version will be saved first.",
      "versions.restored": "✓ Version restored",
      "bulk.delete": "Delete",
      "bulk.move": "Move…",
      "bulk.moveTitle": "Move to parent",
      "bulk.moveTarget": "New parent",
      "bulk.export": "Export",
      "bulk.clear": "Clear",
      "bulk.selected": "{n} selected",
      "bulk.deleteConfirm": "Delete {n} selected thought(s)?",
      "bulk.deleteConfirmCascade": "Some selected thoughts have children. Delete {n} thought(s) and their whole sub-trees?",
      "bulk.deleted": "Deleted {n} thought(s)",
      "bulk.moved": "Moved {n} thought(s)",
      "bulk.skipped": "{n} skipped",
      "bulk.noTarget": "No other thoughts to use as a target parent.",
      "timeline.created": "Created",
      "timeline.updated": "Updated",
      "timeline.empty": "No thoughts yet.",
      "timeline.dateLabel": "Today",
      "timeline.yesterday": "Yesterday",
      "timeline.sortTitle": "Sort by creation or last-update date",
      "review.orphans": "Orphans",
      "review.stale": "Stale",
      "review.disconnected": "Disconnected",
      "review.empty": "Nothing to review here.",
      "review.staleDays": "Older than (days)",
      "review.aiLink": "Suggest parent",
      "review.linking": "Asking AI…",
      "review.accept": "Add link",
      "review.noSuggestions": "No parent suggestions found — this thought may already be the root (nothing broader exists).",
      "review.newParentsIntro": "Proposed new parents by taxonomic rank:",
      "review.createChain": "Create & link",
      "rel.childrenSection": "Suggested children:",
      "rel.newChildrenIntro": "Proposed new children:",
      "rel.addChildren": "Add children",
      "rel.createChildren": "Create & link",
      "rel.siblingsSection": "Suggested siblings:",
      "rel.newSiblingsIntro": "Proposed new siblings:",
      "rel.addSiblings": "Add siblings",
      "rel.createSiblings": "Create & link",
      "rel.siblingsNoParent": "This thought has no parents yet — add a parent before linking siblings.",
      "detail.export": "⬇ Export",
      "detail.exportTitle": "Export this thought",
      "detail.exportMd": "Markdown",
      "detail.exportMdTitle": "Download this thought as Markdown",
      "detail.exportJson": "JSON",
      "detail.exportJsonTitle": "Download this thought as JSON",
      "detail.delete": "Delete",
      "detail.parents": "Parents",
      "detail.children": "Children",
      "detail.siblings": "Siblings",
      "detail.backlinks": "Backlinks",
      "detail.backlinksHint": "Thoughts that mention this one in their content",
      "detail.noBacklinks": "No backlinks — nothing mentions this thought.",
      "detail.comments": "Comments",
      "detail.media": "Media",
      "detail.mediaHint": "Drop files here or click to upload (images, videos, PDFs)",
      "detail.mediaDropTitle": "Drop files here or click to upload",
      "detail.mediaNone": "No media yet.",
      "detail.mediaUploading": "Uploading…",
      "detail.mediaUploaded": "Uploaded {n} file{s}",
      "detail.mediaDeleted": "Media removed",
      "detail.mediaDeleteTitle": "Remove this file from the thought",
      "detail.mediaOpenTitle": "Open the original file",
      "detail.mediaFailed": "Upload failed: {message}",
      "detail.mediaCodecWarn": "This video uses the {codec} codec, which most browsers can't decode — you may only hear the audio.",
      "detail.mediaDeleteWarn": "Removed from this thought, but the file is still in use and could not be deleted from disk. It will be cleaned up automatically.",
      "detail.noParent": "No parents (root thought)",
      "detail.noChildren": "No children yet",
      "detail.noSiblings": "No siblings",
      "detail.noContent": "(no content)",
      "detail.preview": "Preview",
      "detail.source": "Source",
      "detail.modeTitle": "Switch between rendered preview and raw markdown",
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
      "search.semanticNote": "Semantic searching…",
      "search.aiNote": "AI searching…",
      "search.noResults": "No results found.",
      "search.count": "{n} result{s}",
      "stats.title": "Statistics",
      "stats.total": "Total thoughts: ",
      "stats.sectionThought": "Thought types",
      "stats.sectionQuestion": "Follow-up question types",
      "stats.noThoughts": "No thoughts yet.",
      "stats.scopeLabel": "Scope",
      "stats.scopeCurrent": "Current KB",
      "stats.scopeAll": "All KBs",
      "stats.sectionKbs": "Knowledge bases",
      "followups.hint": "Follow-up questions…",
      "followups.covered": "✓ Saved",
      "followups.refreshTitle": "Replace already-saved questions with new ones",
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
      "settings.autoFollowups": "Auto follow-up questions",
      "settings.language": "Language",
      "settings.embedding": "Semantic search (local embeddings)",
      "settings.embeddingEnabled": "Enable local semantic search",
      "settings.embeddingModel": "Embedding model",
      "settings.embeddingStatus": "{embedded} / {total} thoughts embedded",
      "settings.reembed": "Re-embed all thoughts",
      "settings.reembedHint": "Rebuilds local embeddings for every thought (needed after enabling or changing the model). First run downloads the model.",
      "settings.reembedStart": "Re-embedding started…",
      "settings.reembedDone": "Re-embedding complete: {n} thoughts.",
      "settings.dangerZone": "Danger zone",
      "settings.clearKb": "Clear this knowledge base",
      "settings.clearKbHint": "Deletes all thoughts in the current knowledge base and starts fresh.",
      "confirm.deleteCascade": "Delete “{title}” and all its descendants? This cannot be undone.",
      "confirm.delete": "Delete “{title}”? This cannot be undone.",
      "toast.translationFailed": "Saved, but the Romanian translation failed — this thought is English-only for now.",
      "toast.alreadyExists": "“{title}” already exists — selected it.",
      "toast.selectedExisting": "Selected existing thought “{title}” instead.",
      "dup.title": "Possible duplicate",
      "dup.body": "This looks very similar to an existing thought: “{title}”.",
      "dup.similarity": "{pct}% similar",
      "dup.newThought": "New thought",
      "dup.existingThought": "Existing thought",
      "dup.noContent": "(no content)",
      "dup.selectIt": "Select existing thought",
      "dup.saveAnyway": "Save anyway",
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
      "toast.singleKbOnly": "Available in single knowledge base mode.",
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
      "connect.title": "Connect to related thoughts",
      "connect.button": "Connect to {parent}",
      "connect.dismiss": "Dismiss",
      "connect.none": "No link suggestions available.",
      "import.confirm": "Import will replace your entire knowledge base, restoring thoughts, links, comments, media, and trash. Continue?",
      "import.failed": "Import failed",
      "import.mediaLimit": "Some media files were too large to embed and will be imported without their bytes.",
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
      "toolbar.newThoughtTitle": "Creează un gând rădăcină nou (N)",
      "toolbar.link": "Leagă părinte→copil",
      "toolbar.linkTitle": "Creează o legătură părinte → copil între două gânduri selectate",
      "toolbar.linkHint": "Legi „{a}” → „{b}”?",
      "toolbar.viewGraph": "Graf",
      "toolbar.viewOutline": "Contur",
      "toolbar.viewTimeline": "Cronologie",
      "toolbar.viewReview": "Revizuire",
      "toolbar.viewTitle": "Comută între vizualizarea grafic și contur",
      "toolbar.select": "Selectare",
      "toolbar.selectTitle": "Afișează casetele de selectare în Contur, Cronologie și Revizuire",
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
      "toolbar.graphTools": "⋯",
      "toolbar.graphToolsTitle": "Instrumente pentru grafic",
      "toolbar.resetLayout": "Resetează aspectul",
      "toolbar.resetLayoutTitle": "Șterge pozițiile salvate și reia aspectul curent",
      "toolbar.minimap": "Hartă minimă",
      "toolbar.minimapTitle": "Comută harta minimă a graficului",
      "toolbar.theme": "Temă",
      "toolbar.themeTitle": "Schimbă tema graficului (luminos / neon întunecat)",
      "toolbar.themeLight": "Luminos",
      "toolbar.themeDark": "Neon întunecat",
      "toolbar.searchPh": "Caută…",
      "toolbar.searchModeTitle": "Mod de căutare",
      "toolbar.searchExact": "Exact",
      "toolbar.searchSemantic": "Semantic",
      "toolbar.searchAi": "AI",
      "toolbar.searchAll": "Toate bazele",
      "toolbar.kb": "Bază",
      "toolbar.kbTitle": "Bază de cunoștințe activă",
      "toolbar.kbMore": "⋯",
      "toolbar.kbMoreTitle": "Administrează bazele de cunoștințe",
      "toolbar.kbNew": "＋ Nouă",
      "toolbar.kbNewTitle": "Creează o bază de cunoștințe nouă",
      "toolbar.kbRename": "Redenumește",
      "toolbar.kbRenameTitle": "Redenumește baza de cunoștințe curentă",
      "toolbar.kbDelete": "Șterge",
      "toolbar.kbDeleteTitle": "Șterge o bază de cunoștințe",
      "toolbar.navToggleTitle": "Comută bara de instrumente",
      "toolbar.more": "⋯ Mai mult",
      "toolbar.moreTitle": "Mai multe instrumente",
      "toolbar.export": "Exportă JSON",
      "toolbar.exportTitle": "Descarcă baza de cunoștințe ca JSON complet",
      "toolbar.exportMarkdown": "Exportă Markdown",
      "toolbar.exportMdTitle": "Descarcă baza de cunoștințe ca Markdown",
      "export.done": "✓ Export descărcat",
      "toolbar.import": "Importă",
      "toolbar.importTitle": "Încarcă o bază de cunoștințe din JSON",
      "toolbar.stats": "📊 Statistici",
      "toolbar.statsTitle": "Statistici ale bazei de cunoștințe",
      "toolbar.trash": "🗑 Coș de reciclare",
      "toolbar.trashTitle": "Deschide coșul de reciclare",
      "toolbar.backups": "💾 Copii de rezervă",
      "toolbar.backupsTitle": "Copii de rezervă și restaurare",
      "toolbar.shortcuts": "⌨ Scurtături de tastatură",
      "toolbar.shortcutsTitle": "Referință scurtături de tastatură",
      "shortcuts.title": "Scurtături de tastatură",
      "shortcuts.newThought": "Gând nou",
      "shortcuts.editThought": "Editează gândul selectat",
      "shortcuts.deleteThought": "Șterge gândul selectat",
      "trash.title": "Coș de reciclare",
      "trash.empty": "Golește coșul",
      "trash.emptyHint": "Șterge definitiv tot ce e în coș. Această acțiune nu poate fi anulată.",
      "trash.emptyDone": "✓ Coș golit",
      "trash.emptyConfirm": "Tastează numărul {n} pentru a goli definitiv coșul.",
      "trash.none": "Coșul este gol.",
      "trash.restore": "Restaurează",
      "trash.restoreDone": "✓ Gând restaurat",
      "trash.purge": "Șterge definitiv",
      "trash.purgeConfirm": "Ștergi definitiv „{title}”? Această acțiune nu poate fi anulată.",
      "trash.purgeDone": "✓ Gând șters definitiv",
      "trash.deletedAt": "Șters {date}",
      "trash.purgeAllHint": "Aceasta șterge definitiv {n} gând{gând}.",
      "backups.title": "Copii de rezervă",
      "backups.create": "Creează copie acum",
      "backups.createAll": "Copie de rezervă pentru toate BC",
      "backups.none": "Nicio copie de rezervă încă.",
      "backups.restore": "Restaurează",
      "backups.restoreConfirm": "Restaurezi „{filename}”? Datele actuale vor fi suprascrise. Mai întâi se face o copie de siguranță.",
      "backups.restoreDone": "✓ Copie de rezervă restaurată",
      "backups.size": "{size}",
      "backups.createdAt": "{date}",
      "backups.backedUpAll": "✓ Copie de rezervă pentru {n} baze de cunoștințe",
      "backups.backedUp": "✓ Copie de rezervă creată",
      "backups.verifyWarning": "⚠ Copia de rezervă a fost creată, dar nu a trecut verificarea de integritate — s-ar putea să nu se restaureze corect. Verifică spațiul pe disc și încearcă din nou.",
      "toolbar.filter": "Filtru",
      "toolbar.filterTitle": "Filtrează gândurile după tip",
      "toolbar.filterCountTitle": "Filtre active",
      "filter.sectionThought": "Tipuri de gânduri",
      "filter.sectionQuestion": "Tipuri de întrebări de follow-up",
      "filter.sectionFocus": "Focalizare",
      "filter.focusOff": "Oprit",
      "filter.focusDesc": "Descendenți",
      "filter.focusAnc": "Ascendenți",
      "filter.focusBoth": "Ambele",
      "filter.clear": "Șterge",
      "filter.allKbs": "Toate BC",
      "filter.allKbsTitle": "Afișează gândurile potrivite din toate bazele de cunoștințe",
      "toolbar.settings": "Setări",
      "toolbar.settingsTitle": "Setări DeepSeek",
      "chat.title": "Chat DeepSeek",
      "chat.statusTitle": "conexiune",
      "chat.contextTitle": "Include gândul selectat ca context în promptul tău",
      "chat.useContext": "Folosește gândul selectat ca context",
      "chat.contextPrefix": "Context: ",
      "chat.autoFollowups": "Întrebări follow-up automate",
      "chat.autoFollowupsTitle": "Generează automat întrebări de follow-up când selectezi un gând",
      "chat.saveResponse": "Salvează răspunsul",
      "chat.saveChild": "ca copil al selecției",
      "chat.saveSibling": "ca frate al selecției",
      "chat.saveRoot": "ca gând rădăcină nou",
      "chat.saveAsThought": "Salvează ca gând",
      "chat.more": "⋯",
      "chat.moreTitle": "Mai multe acțiuni pentru chat",
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
      "detail.ai": "✨ AI",
      "detail.aiTitle": "Acțiuni AI pentru acest gând",
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
      "detail.suggestParents": "🔗 Sugerează părinți",
      "detail.suggestParentsTitle": "Întreabă AI-ul ce gânduri-părinte s-ar potrivi acestui gând",
      "detail.suggestRelations": "🔗 Sugerează copii și frați",
      "detail.suggestRelationsTitle": "Întreabă AI-ul ce gânduri-copii și gânduri-frați s-ar potrivi acestui gând",
      "detail.edit": "Editează",
      "detail.history": "Istoric",
      "detail.historyTitle": "Vezi istoricul editărilor acestui gând",
      "versions.title": "Istoricul versiunilor",
      "versions.empty": "Nicio versiune încă. Editările sunt înregistrate automat.",
      "versions.count": "{n} versiuni",
      "versions.restore": "Restabilește",
      "versions.restoreConfirm": "Restabilești versiunea din {date}? Versiunea curentă va fi salvată.",
      "versions.restored": "✓ Versiune restabilită",
      "bulk.delete": "Șterge",
      "bulk.move": "Mută…",
      "bulk.moveTitle": "Mută sub părinte",
      "bulk.moveTarget": "Noul părinte",
      "bulk.export": "Exportă",
      "bulk.clear": "Resetează",
      "bulk.selected": "{n} selectate",
      "bulk.deleteConfirm": "Ștergi {n} gând(uri) selectate?",
      "bulk.deleteConfirmCascade": "Unele gânduri selectate au copii. Ștergi {n} gând(uri) și întregul lor sub-arbore?",
      "bulk.deleted": "{n} gând(uri) șterse",
      "bulk.moved": "{n} gând(uri) mutate",
      "bulk.skipped": "{n} omise",
      "bulk.noTarget": "Nu există alte gânduri de folosit ca părinte țintă.",
      "timeline.created": "Create",
      "timeline.updated": "Actualizate",
      "timeline.empty": "Niciun gând încă.",
      "timeline.dateLabel": "Astăzi",
      "timeline.yesterday": "Ieri",
      "timeline.sortTitle": "Sortează după data creării sau ultimei actualizări",
      "review.orphans": "Orfani",
      "review.stale": "Învechite",
      "review.disconnected": "Izolate",
      "review.empty": "Nimic de revizuit aici.",
      "review.staleDays": "Mai vechi de (zile)",
      "review.aiLink": "Sugerează părinte",
      "review.linking": "Întreb AI-ul…",
      "review.accept": "Adaugă legătura",
      "review.noSuggestions": "Nu s-au găsit sugestii de părinți — acest gând este probabil deja rădăcina (nu există un concept mai larg).",
      "review.newParentsIntro": "Părinți noi propuși după rang taxonomic:",
      "review.createChain": "Creează și leagă",
      "rel.childrenSection": "Copii sugerați:",
      "rel.newChildrenIntro": "Copii noi propuși:",
      "rel.addChildren": "Adaugă copiii",
      "rel.createChildren": "Creează și leagă",
      "rel.siblingsSection": "Frați sugerați:",
      "rel.newSiblingsIntro": "Frați noi propuși:",
      "rel.addSiblings": "Adaugă frații",
      "rel.createSiblings": "Creează și leagă",
      "rel.siblingsNoParent": "Acest gând nu are încă părinți — adaugă un părinte înainte de a lega frați.",
      "detail.export": "⬇ Exportă",
      "detail.exportTitle": "Exportă acest gând",
      "detail.exportMd": "Markdown",
      "detail.exportMdTitle": "Descarcă acest gând ca Markdown",
      "detail.exportJson": "JSON",
      "detail.exportJsonTitle": "Descarcă acest gând ca JSON",
      "detail.delete": "Șterge",
      "detail.parents": "Părinți",
      "detail.children": "Copii",
      "detail.siblings": "Frați",
      "detail.backlinks": "Backlink-uri",
      "detail.backlinksHint": "Gânduri care îl menționează pe acesta în conținut",
      "detail.noBacklinks": "Fără backlink-uri — nimic nu menționează acest gând.",
      "detail.comments": "Comentarii",
      "detail.media": "Media",
      "detail.mediaHint": "Trage fișiere aici sau dă click pentru a încărca (imagini, videoclipuri, PDF-uri)",
      "detail.mediaDropTitle": "Trage fișiere aici sau dă click pentru a încărca",
      "detail.mediaNone": "Încă fără media.",
      "detail.mediaUploading": "Se încarcă…",
      "detail.mediaUploaded": "S-au încărcat {n} fișier{e}",
      "detail.mediaDeleted": "Media a fost eliminată",
      "detail.mediaDeleteTitle": "Elimină acest fișier de la gând",
      "detail.mediaOpenTitle": "Deschide fișierul original",
      "detail.mediaFailed": "Încărcarea a eșuat: {message}",
      "detail.mediaCodecWarn": "Acest videoclip folosește codec-ul {codec}, pe care majoritatea browserelor nu îl pot decoda — s-ar putea să auzi doar audio.",
      "detail.mediaDeleteWarn": "Eliminat din acest gând, dar fișierul este încă folosit și nu a putut fi șters de pe disc. Va fi curățat automat.",
      "detail.noParent": "Fără părinți (gând rădăcină)",
      "detail.noChildren": "Încă fără copii",
      "detail.noSiblings": "Fără frați",
      "detail.noContent": "(fără conținut)",
      "detail.preview": "Previzualizare",
      "detail.source": "Sursă",
      "detail.modeTitle": "Comută între previzualizarea redată și markdown-ul brut",
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
      "search.semanticNote": "Căutare semantică…",
      "search.aiNote": "Căutare AI…",
      "search.noResults": "Nu s-au găsit rezultate.",
      "search.count": "{n} rezultat{e}",
      "stats.title": "Statistici",
      "stats.total": "Total gânduri: ",
      "stats.sectionThought": "Tipuri de gânduri",
      "stats.sectionQuestion": "Tipuri de întrebări de follow-up",
      "stats.noThoughts": "Încă nu există gânduri.",
      "stats.scopeLabel": "Domeniu",
      "stats.scopeCurrent": "BC curentă",
      "stats.scopeAll": "Toate BC",
      "stats.sectionKbs": "Baze de cunoștințe",
      "followups.hint": "Întrebări de follow-up…",
      "followups.covered": "✓ Salvat",
      "followups.refreshTitle": "Înlocuiește întrebările deja salvate cu altele noi",
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
      "settings.autoFollowups": "Întrebări follow-up automate",
      "settings.language": "Limbă",
      "settings.embedding": "Căutare semantică (embeddings locale)",
      "settings.embeddingEnabled": "Activează căutarea semantică locală",
      "settings.embeddingModel": "Model de embedding",
      "settings.embeddingStatus": "{embedded} / {total} gânduri indexate",
      "settings.reembed": "Re-indexează toate gândurile",
      "settings.reembedHint": "Reconstruiește embeddings locale pentru fiecare gând (necesar după activare sau schimbarea modelului). Prima rulare descarcă modelul.",
      "settings.reembedStart": "Re-indexare pornită…",
      "settings.reembedDone": "Re-indexare completă: {n} gânduri.",
      "settings.dangerZone": "Zonă de pericol",
      "settings.clearKb": "Golește această bază de cunoștințe",
      "settings.clearKbHint": "Șterge toate gândurile din baza de cunoștințe curentă și pornește de la zero.",
      "confirm.deleteCascade": "Ștergi „{title}” și toți descendenții săi? Această acțiune nu poate fi anulată.",
      "confirm.delete": "Ștergi „{title}”? Această acțiune nu poate fi anulată.",
      "toast.translationFailed": "Salvat, dar traducerea în română a eșuat — acest gând este momentan doar în engleză.",
      "toast.alreadyExists": "„{title}” există deja — am selectat-o.",
      "toast.selectedExisting": "Am selectat gândul existent „{title}” în loc.",
      "dup.title": "Posibil duplicat",
      "dup.body": "Acest gând seamănă foarte mult cu unul existent: „{title}”.",
      "dup.similarity": "{pct}% asemănător",
      "dup.newThought": "Gând nou",
      "dup.existingThought": "Gând existent",
      "dup.noContent": "(fără conținut)",
      "dup.selectIt": "Selectează gândul existent",
      "dup.saveAnyway": "Salvează oricum",
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
      "toast.singleKbOnly": "Disponibil doar în modul bază de cunoștințe unică.",
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
      "connect.title": "Conectează la gânduri legate",
      "connect.button": "Conectează la „{parent}”",
      "connect.dismiss": "Închide",
      "connect.none": "Nicio sugestie de legare disponibilă.",
      "import.confirm": "Importul va înlocui întreaga bază de cunoștințe, restaurând gânduri, legături, comentarii, media și coșul de gunoi. Continui?",
      "import.failed": "Importul a eșuat",
      "import.mediaLimit": "Unele fișiere media au fost prea mari pentru a fi incluse și vor fi importate fără conținut.",
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

  const LIGHT_THEME_STYLE = [
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
    {
      selector: "node.dimmed",
      style: { "opacity": 0.12 },
    },
    {
      selector: "edge.dimmed",
      style: { "opacity": 0.1, "text-opacity": 0 },
    },
  ];

  // Neon-hologram theme: dark nodes with a glow ring, bright edges, and a
  // cyan flowing-dash overlay driven by setInterval in setGraphTheme().
  const DARK_THEME_STYLE = [
    {
      selector: "node",
      style: {
        "background-color": "#0f1d33",
        "background-fill": "radial-gradient",
        "background-gradient-stop-colors": ["#3a6ea5", "#0a1424"],
        "background-gradient-stop-positions": ["0%", "70%"],
        "border-width": 2,
        "border-color": "data(sourceColor)",
        "box-shadow": "0 0 12px data(sourceColor)",
        "width": 30,
        "height": 30,
        "label": "data(label)",
        "font-size": 11,
        "text-wrap": "wrap",
        "text-max-width": 92,
        "text-valign": "bottom",
        "text-margin-y": 8,
        "text-background-color": "rgba(4,12,22,0.78)",
        "text-background-opacity": 1,
        "text-background-padding": "4px",
        "text-background-shape": "roundrectangle",
        "color": "#cfe4ff",
        "overlay-opacity": 0,
      },
    },
    {
      selector: "node[childCount > 0]",
      style: {
        "border-style": "dashed",
        "border-color": "#4d78b8",
        "border-width": 1.5,
      },
    },
    {
      selector: "node.selected",
      style: { "border-color": "#58a6ff", "border-width": 3, "box-shadow": "0 0 18px #58a6ff" },
    },
    {
      selector: "edge",
      style: {
        "width": 1.4,
        "line-color": "#3f5d85",
        "target-arrow-color": "#7cc0ff",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
      },
    },
    {
      selector: "edge.selected",
      style: { "line-color": "#58a6ff", "target-arrow-color": "#58a6ff", "width": 2.2 },
    },
    {
      selector: "node.dimmed",
      style: { "opacity": 0.08 },
    },
    {
      selector: "edge.dimmed",
      style: { "opacity": 0.05, "text-opacity": 0 },
    },
  ];

  const cy = window.cytoscape({
    container: document.getElementById("graph"),
    elements: [],
    style: LIGHT_THEME_STYLE,
    layout: { name: "cose", animate: false },
  });

  // ------------------------------------------------------------- dom refs

  const $ = (id) => document.getElementById(id);
  const graphEl = $("graph");
  const outlineEl = $("outline");
  const previewEl = $("node-preview");
  const emptyHint = $("empty-hint");
  const linkHint = $("link-hint");
  const filterBtn = $("btn-filter");
  const filterCount = $("filter-count");
  const filterPanel = $("filter-panel");
  const moreBtn = $("btn-more");
  const morePanel = $("more-panel");
  const kbMoreBtn = $("btn-kb-more");
  const kbMorePanel = $("kb-more-panel");
  const detailAiBtn = $("btn-detail-ai");
  const detailAiPanel = $("detail-ai-panel");
  const nodeMenuEl = $("node-menu");
  const chatMoreBtn = $("btn-chat-more");
  const chatMorePanel = $("chat-more-panel");
  const graphToolsBtn = $("btn-graph-tools");
  const graphToolsPanel = $("graph-tools-panel");
  const detailExportBtn = $("btn-detail-export");
  const detailExportPanel = $("detail-export-panel");
  const navBtn = $("btn-nav");
  const toolbarEl = $("toolbar");
  const filterSourcesEl = $("filter-sources");
  const filterQtypesEl = $("filter-qtypes");
  const filterAllKbsEl = $("filter-all-kbs");
  const focusChipsEl = $("filter-focus");
  const layoutSelect = $("layout-select");
  const minimapEl = $("minimap");
  const btnLink = $("btn-link");
  const bulkBar = $("bulk-bar");
  const bulkCount = $("bulk-count");
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
  const detailMedia = $("detail-media");
  const mediaDropzone = $("media-dropzone");
  const mediaFileInput = $("media-file-input");
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

  async function createThought(payload, opts = {}) {
    const checkDuplicate = opts.checkDuplicate !== false;
    if (checkDuplicate) {
      try {
        const dup = await post("/api/thoughts/check-duplicate", {
          title: payload.title || "",
          content: payload.content || "",
        });
        const m = dup && dup.matches && dup.matches[0];
        if (m) {
          const choice = await confirmDuplicate(m, { title: payload.title || "", content: payload.content || "" });
          if (choice === "select") {
            toast(tr("toast.selectedExisting", { title: m.title }));
            selectThought(m.id);
            return null;
          }
        }
      } catch (e) { /* dedup is a nicety — never block saving on its failure */ }
    }
    try {
      // The backend always stores English as primary and Romanian alongside,
      // so no skip flag is needed regardless of the UI language.
      const created = await post("/api/thoughts", payload);
      if (created && created.translation_failed) {
        toast(tr("toast.translationFailed"));
      }
      return created;
    } catch (err) {
      if (err.existingId) {
        toast(tr("toast.alreadyExists", { title: payload.title }));
        selectThought(err.existingId);
        return null;
      }
      throw err;
    }
  }

  function confirmDuplicate(match, newThought) {
    // Resolves "select" (jump to the existing thought, don't save) or "save".
    // Dismissing the modal (overlay / Esc) defaults to "save" — the check is
    // advisory and must never strand the original save action.
    const pct = typeof match.similarity === "number" ? match.similarity : null;
    const simHtml = pct !== null
      ? `<span class="dup-sim dup-sim-${pct >= 70 ? "high" : pct >= 40 ? "med" : "low"}">${escHtml(tr("dup.similarity", { pct }))}</span>`
      : "";
    const newTitle = (newThought && newThought.title) || "";
    const newContent = (newThought && newThought.content) || "";
    const pane = (heading, title, content, isNew) => `
      <div class="dup-pane${isNew ? " dup-pane-new" : ""}">
        <div class="dup-pane-head">${escHtml(heading)}${isNew ? simHtml : ""}</div>
        <div class="dup-pane-title">${escHtml(title) || "&nbsp;"}</div>
        <div class="dup-pane-body">${escHtml(content) || escHtml(tr("dup.noContent"))}</div>
      </div>`;
    return new Promise((resolve) => {
      const m = openModal(tr("dup.title"), `
        <p class="form-hint" style="margin-top:0">${escHtml(tr("dup.body", { title: match.title }))}</p>
        <div class="dup-compare">
          ${pane(tr("dup.newThought"), newTitle, newContent, true)}
          ${pane(tr("dup.existingThought"), match.title, match.content, false)}
        </div>
        <p class="form-hint" style="margin-top:0">${escHtml(match.reason || "")}</p>
        <div class="form-actions">
          <button class="btn" data-dup-save>${tr("dup.saveAnyway")}</button>
          <button class="btn primary" data-dup-select>${tr("dup.selectIt")}</button>
        </div>
      `, { cleanup: () => resolve("save"), modalClass: "modal-wide" });
      const pick = (choice) => { resolve(choice); m.close(); };
      m.body.querySelector("[data-dup-save]").onclick = () => pick("save");
      m.body.querySelector("[data-dup-select]").onclick = () => pick("select");
    });
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

  // ------------------------------------------------------------- filters

  const SOURCE_KEYS = ["prompt", "generated", "extract", "manual", "unknown"];
  const QTYPE_KEYS = ["scientific", "practical", "comparative", "historical", "causal", "critical", "untyped"];

  function activeFilterCount() {
    return state.filterSources.size + state.filterQtypes.size + (state.focusMode !== "off" ? 1 : 0);
  }

  function matchesFilters(t) {
    if (state.filterSources.size) {
      const src = t.source || "unknown";
      if (!state.filterSources.has(src)) return false;
    }
    if (state.filterQtypes.size) {
      // "untyped" matches any empty/unknown type — same definition as the
      // stats endpoint, which collapses non-standard values to "untyped".
      const qt = (t.question_type || "").trim().toLowerCase();
      const effective = (qt === "scientific" || qt === "practical" || qt === "comparative"
        || qt === "historical" || qt === "causal" || qt === "critical") ? qt : "untyped";
      if (!state.filterQtypes.has(effective)) return false;
    }
    return true;
  }

  function filteredThoughts() {
    if (activeFilterCount() === 0) return state.thoughts;
    const focusSet = (state.focusMode !== "off" && state.selectedThought)
      ? focusClosure(String(state.selectedThought.id), state.focusMode)
      : null;
    return state.thoughts.filter(
      (t) => matchesFilters(t) && (!focusSet || focusSet.has(String(t.id)))
    );
  }

  // Edges that survive the current filter: both endpoints visible.
  function filteredEdges() {
    if (activeFilterCount() === 0) return state.edges;
    const ids = new Set(filteredThoughts().map((t) => t.id));
    return state.edges.filter((e) => ids.has(e.parent_id) && ids.has(e.child_id));
  }

  function updateFilterCount() {
    const n = activeFilterCount();
    filterCount.textContent = n ? String(n) : "";
    filterCount.classList.toggle("hidden", n === 0);
  }

  function buildFilterChips() {
    filterSourcesEl.innerHTML = SOURCE_KEYS.map((k) =>
      `<button type="button" class="chip filter-chip" data-type="source" data-key="${escAttr(k)}">${escHtml(sourceLabel(k))}</button>`
    ).join("");
    filterQtypesEl.innerHTML = QTYPE_KEYS.map((k) =>
      `<button type="button" class="chip filter-chip" data-type="qtype" data-key="${escAttr(k)}">${escHtml(qtypeLabel(k))}</button>`
    ).join("");
    updateFilterChips();
  }

  function updateFilterChips() {
    filterSourcesEl.querySelectorAll(".filter-chip").forEach((el) => {
      el.classList.toggle("active", state.filterSources.has(el.dataset.key));
    });
    filterQtypesEl.querySelectorAll(".filter-chip").forEach((el) => {
      el.classList.toggle("active", state.filterQtypes.has(el.dataset.key));
    });
    if (focusChipsEl) {
      focusChipsEl.querySelectorAll(".filter-chip").forEach((el) => {
        el.classList.toggle("active", state.focusMode === el.dataset.focus);
      });
    }
  }

  function setFocus(mode) {
    state.focusMode = mode;
    state._lastFocusRootId = state.selectedThought ? String(state.selectedThought.id) : null;
    updateFilterChips();
    updateFilterCount();
    applyFilters();
  }

  // Parent and child maps with String()-normalized keys, shared by focus and
  // expand modes. buildChildrenMap (outline) is left untouched.
  function buildStringMaps(edges = state.edges) {
    const children = new Map();
    const parents = new Map();
    for (const e of edges) {
      const p = String(e.parent_id), c = String(e.child_id);
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(c);
      if (!parents.has(c)) parents.set(c, []);
      parents.get(c).push(p);
    }
    return { children, parents };
  }

  // Ancestors/descendants closure of rootId over the full edge set. Cycle-guarded
  // by the visited Set (so loops never hang the walk).
  function focusClosure(rootId, mode, edges = state.edges) {
    const { children, parents } = buildStringMaps(edges);
    const out = new Set([rootId]);
    const walk = (start, map) => {
      const stack = [...(map.get(start) || [])];
      while (stack.length) {
        const id = stack.pop();
        if (out.has(id)) continue;
        out.add(id);
        stack.push(...(map.get(id) || []));
      }
    };
    if (mode === "descendants") walk(rootId, children);
    else if (mode === "ancestors") walk(rootId, parents);
    else if (mode === "both") { walk(rootId, children); walk(rootId, parents); }
    return out;
  }

  // ---- expand-neighbors (dim) mode -------------------------------------

  function computeExpandSet(id) {
    const { children, parents } = buildStringMaps(state.edges);
    const set = new Set([String(id)]);
    (parents.get(String(id)) || []).forEach((p) => set.add(p));
    (children.get(String(id)) || []).forEach((c) => set.add(c));
    return set;
  }

  function applyDimState() {
    if (state.expandNode == null) return;
    const set = computeExpandSet(state.expandNode);
    cy.nodes().forEach((n) => n.toggleClass("dimmed", !set.has(String(n.id()))));
    cy.edges().forEach((e) => {
      const both = set.has(String(e.source().id())) && set.has(String(e.target().id()));
      e.toggleClass("dimmed", !both);
    });
    cy.style().update();
  }

  function clearExpand() {
    if (state.expandNode == null) return;
    state.expandNode = null;
    cy.nodes().removeClass("dimmed");
    cy.edges().removeClass("dimmed");
    cy.style().update();
  }

  function setFilter(type, key, on) {
    const set = type === "source" ? state.filterSources : state.filterQtypes;
    if (on) set.add(key); else set.delete(key);
    updateFilterCount();
    updateFilterChips();
    applyFilters();
  }

  function clearFilters() {
    if (activeFilterCount() === 0) return;
    state.filterSources.clear();
    state.filterQtypes.clear();
    state.focusMode = "off";
    updateFilterCount();
    updateFilterChips();
    applyFilters();
  }

  function applyFilters() {
    if (state.viewMode === "outline") renderOutline();
    else if (state.viewMode === "timeline") renderTimeline();
    else if (state.viewMode === "review") renderReview();
    else renderGraph();
  }

  // In All-KBs mode thoughts carry composite "<slug>#<num>" ids; the backend
  // still needs the plain numeric id. Fetched detail objects have no orig_id,
  // so this falls back to their real id.
  function detailIdFor(t) {
    if (!t) return null;
    return (state.filterAllKbs && t.orig_id != null) ? t.orig_id : t.id;
  }

  function currentKbName() {
    return $("kb-select").value;
  }

  function compositeThoughtFor(kb, plainId) {
    return state.thoughts.find((x) => x.kb === kb && x.orig_id === plainId);
  }

  // Edge ids are "e-<slug>#<linkid>" in All-KBs mode; the backend wants the
  // plain numeric link id.
  function linkBackendId(e) {
    return e.id.includes("#") ? e.id.split("#")[1] : e.id;
  }

  function initFilters() {
    buildFilterChips();
    updateFilterCount();
    // Focus chips carry data-focus (not data-type), so skip them here — they'd
    // otherwise hit setFilter(undefined, ...) and add a bogus qtype.
    filterPanel.querySelectorAll(".filter-chip").forEach((el) => {
      if (!el.dataset.type) return;
      el.addEventListener("click", () => setFilter(el.dataset.type, el.dataset.key, !el.classList.contains("active")));
    });
    if (focusChipsEl) {
      focusChipsEl.querySelectorAll(".filter-chip").forEach((el) => {
        el.addEventListener("click", () => setFocus(el.dataset.focus));
      });
    }
    $("filter-clear").addEventListener("click", clearFilters);
    filterAllKbsEl.addEventListener("change", async () => {
      state.filterAllKbs = filterAllKbsEl.checked;
      // The id space flips between numeric and composite "<slug>#<id>", so a
      // previously-built expansion set no longer applies — start all-expanded.
      state.outlineExpanded = null;
      try {
        await refreshGraph();
        selectThought(null);
        showDetail(null);
      } catch (err) { toast(err.message); }
    });
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasHidden = filterPanel.classList.contains("hidden");
      filterPanel.classList.toggle("hidden", !wasHidden);
      filterBtn.classList.toggle("active", wasHidden);
    });
    document.addEventListener("click", (e) => {
      if (!filterPanel.classList.contains("hidden")) {
        filterPanel.classList.add("hidden");
        filterBtn.classList.remove("active");
      }
    });
    filterPanel.addEventListener("click", (e) => e.stopPropagation());
  }

  function initDropdown(btn, panel) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasHidden = panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !wasHidden);
    });
    document.addEventListener("click", (e) => {
      if (!panel.classList.contains("hidden")) {
        panel.classList.add("hidden");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.classList.contains("hidden")) {
        panel.classList.add("hidden");
      }
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
  }

  function initMoreMenu() {
    initDropdown(moreBtn, morePanel);
    initDropdown(kbMoreBtn, kbMorePanel);
    initDropdown(detailAiBtn, detailAiPanel);
    initDropdown(chatMoreBtn, chatMorePanel);
    initDropdown(graphToolsBtn, graphToolsPanel);
    initDropdown(detailExportBtn, detailExportPanel);
    // Anchor the detail panel's menus to their trigger buttons; they sit in a
    // wrapping flex row whose right edge may not line up with the panel's right edge.
    detailAiPanel.style.right = "auto";
    detailExportPanel.style.right = "auto";
  }

  const NAV_BREAKPOINT = 1150;
  function initNav() {
    function syncNav() {
      const narrow = window.innerWidth <= NAV_BREAKPOINT;
      if (narrow) {
        if (!toolbarEl.classList.contains("nav-collapsed")) toolbarEl.classList.add("nav-collapsed");
      } else {
        toolbarEl.classList.remove("nav-collapsed");
      }
      navBtn.setAttribute("aria-expanded", narrow ? "false" : "true");
    }
    navBtn.addEventListener("click", () => {
      const collapsed = toolbarEl.classList.toggle("nav-collapsed");
      navBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
    window.addEventListener("resize", syncNav);
    syncNav();
  }

  function initShortcuts() {
    function isTyping(e) {
      const t = e.target;
      return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    }
    document.addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      if (!modalOverlay.classList.contains("hidden")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        $("btn-edit-thought").click();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        $("btn-new-thought").click();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedThought) {
        e.preventDefault();
        $("btn-delete-thought").click();
      }
    });
  }

  function initNodeMenu() {
    const menu = nodeMenuEl;

    function hideNodeMenu() { menu.classList.add("hidden"); }

    function showNodeMenu(clientX, clientY, items) {
      menu.innerHTML = "";
      items.forEach((it) => {
        if (it.sep) {
          const d = document.createElement("div");
          d.className = "menu-sep";
          menu.appendChild(d);
          return;
        }
        const b = document.createElement("button");
        b.className = "menu-item" + (it.danger ? " danger" : "");
        b.textContent = it.label;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          hideNodeMenu();
          it.action();
        });
        menu.appendChild(b);
      });
      menu.classList.remove("hidden");
      // Keep the menu inside the viewport.
      const r = menu.getBoundingClientRect();
      const left = clientX + r.width > window.innerWidth - 4
        ? Math.max(4, window.innerWidth - r.width - 4) : clientX;
      const top = clientY + r.height > window.innerHeight - 4
        ? Math.max(4, window.innerHeight - r.height - 4) : clientY;
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    }

    function nodeMenuItems(t) {
      const actions = [
        { label: tr("detail.addChild"), action: () => newThoughtModal(t) },
        {
          label: tr("detail.addSibling"),
          action: () => newThoughtModal(t.parents && t.parents[0] || { title: "", id: null }),
        },
        { sep: true },
        { label: tr("detail.edit"), action: () => editThoughtModal(t) },
      ];
      if (!state.filterAllKbs) {
        actions.push({ sep: true }, {
          label: tr("detail.suggestParents"),
          action: () => suggestParentsForSelected(),
        }, {
          label: tr("detail.suggestRelations"),
          action: () => suggestRelationsForSelected(),
        });
      }
      actions.push(
        { sep: true },
        {
          label: tr("detail.exportMd"),
          action: () => downloadThought("md", detailIdFor(t), fmtTitle(t)),
        },
        {
          label: tr("detail.exportJson"),
          action: () => downloadThought("json", detailIdFor(t), fmtTitle(t)),
        },
        { sep: true },
        {
          label: tr("detail.delete"),
          danger: true,
          action: async () => {
            const hasChildren = t.children && t.children.length > 0;
            const msg = hasChildren
              ? tr("confirm.deleteCascade", { title: short(t.title) })
              : tr("confirm.delete", { title: short(t.title) });
            if (!confirm(msg)) return;
            try {
              await del("/api/thoughts/" + detailIdFor(t) + (hasChildren ? "?cascade=true" : ""));
              await refreshGraph();
              detailEmpty.classList.remove("hidden");
              detailBody.classList.add("hidden");
            } catch (err) { alert(err.message); }
          },
        },
      );
      return actions;
    }

    // Right-click a node opens the per-thought actions at the cursor.
    cy.on("cxttap", "node", (evt) => {
      const t = evt.target.data().thought;
      if (!t) return;
      selectThought(t.id);
      const oe = evt.originalEvent;
      showNodeMenu(oe.clientX, oe.clientY, nodeMenuItems(t));
    });

    // Suppress the browser's native context menu over the whole graph viewport
    // (canvas + overlays like the minimap and hover card, which are siblings of
    // #graph — a listener on the canvas alone would let the OS menu leak
    // through on top of the custom thought menu).
    $("graph-container").addEventListener("contextmenu", (e) => {
      if (state.viewMode === "graph") e.preventDefault();
    });

    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", hideNodeMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideNodeMenu();
    });
  }

  // ------------------------------------------------------------- graph

  const GRAPH_POSITIONS_KEY = "kb.graphPositions";

  function loadSavedPositions() {
    try {
      return JSON.parse(localStorage.getItem(GRAPH_POSITIONS_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function persistSavedPositions(map) {
    try {
      localStorage.setItem(GRAPH_POSITIONS_KEY, JSON.stringify(map));
    } catch (err) { /* storage full / private mode — ignore */ }
  }

  // Which KB's position slot a rendered node maps to. In All-KBs mode the node
  // carries its KB name; otherwise it's the currently active KB.
  function kbKeyForNode(node) {
    const t = node.data("thought");
    return (state.filterAllKbs && t && t.kb) ? t.kb : currentKbName();
  }

  function plainIdForNode(node) {
    const t = node.data("thought");
    return String((state.filterAllKbs && t && t.orig_id) ? t.orig_id : node.id());
  }

  function saveNodePosition(node) {
    const map = loadSavedPositions();
    const kb = kbKeyForNode(node);
    if (!map[kb]) map[kb] = {};
    map[kb][plainIdForNode(node)] = node.position();
    persistSavedPositions(map);
  }

  function clearKbPositions(kb) {
    const map = loadSavedPositions();
    if (!(kb in map)) return;
    delete map[kb];
    persistSavedPositions(map);
  }

  // Build { renderedNodeId: {x,y} } for the currently visible (filtered)
  // thoughts, resolving stored (kb, plainId) keys to rendered ids in both
  // current-KB and All-KBs modes.
  function positionsForCurrentView() {
    const map = loadSavedPositions();
    const out = {};
    for (const t of filteredThoughts()) {
      const kb = (state.filterAllKbs && t.kb) ? t.kb : currentKbName();
      const plain = String(state.filterAllKbs ? t.orig_id : t.id);
      const p = map[kb] && map[kb][plain];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[String(t.id)] = { x: p.x, y: p.y };
    }
    return out;
  }

  // Drop stored positions for thoughts that no longer exist in the current
  // data. Lazily pruned on each refresh; harmless stale entries are never read.
  function pruneSavedPositions() {
    const map = loadSavedPositions();
    const present = new Set(state.thoughts.map((t) => String(state.filterAllKbs ? t.orig_id : t.id)));
    const kb = state.filterAllKbs ? null : currentKbName();
    let changed = false;
    for (const name of Object.keys(map)) {
      if (kb && name !== kb) continue;
      for (const id of Object.keys(map[name])) {
        if (!present.has(id)) { delete map[name][id]; changed = true; }
      }
      if (Object.keys(map[name]).length === 0) { delete map[name]; changed = true; }
    }
    if (changed) persistSavedPositions(map);
  }

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
    const selId = state.selectedThought ? String(state.selectedThought.id) : null;
    const nodes = filteredThoughts().map((t) => ({
      data: {
        id: String(t.id),
        label: fmtTitle(t),
        thought: t,
        sourceColor: sourceColor(t.source),
        childCount: primaryChildCount.get(t.id) || 0,
      },
      // Bake selection into the element so cy.json restores it atomically;
      // otherwise re-renders drop the user's selection (and break focus refocus).
      selected: selId !== null && String(t.id) === selId,
    }));
    const edges = filteredEdges().map((e) => ({
      data: {
        id: "e" + e.id,
        source: String(e.parent_id),
        target: String(e.child_id),
        label: e.label,
      },
    }));
    cy.json({ elements: { nodes, edges } });
    emptyHint.classList.toggle("hidden", state.thoughts.length > 0);

    if (state.expandNode != null && !cy.getElementById(state.expandNode).length) {
      state.expandNode = null; // stale dim root no longer exists
    }

    if (state.thoughts.length > 0 && cy.nodes().length > 0) {
      const layout = layoutSelect.value;
      if (layout === "mindmap") {
        // Structure-driven; re-roots on the selection. Manual positions
        // intentionally never apply to the cascade layout.
        cy.layout(layoutOptions("mindmap")).run();
      } else {
        const positions = positionsForCurrentView();
        cy.nodes().forEach((n) => { const p = positions[n.id()]; if (p) n.position(p); });
        const unpositioned = cy.nodes().filter((n) => !positions[n.id()]);
        if (Object.keys(positions).length > 0 && unpositioned.length > 0) {
          // Mixed: hold the dragged nodes in place, lay out only the new ones,
          // then fit the whole graph so nothing lands off-screen.
          cy.layout({ ...layoutOptions(layout), nodes: unpositioned, fit: false }).run();
          cy.fit(undefined, 60);
        } else if (Object.keys(positions).length > 0) {
          cy.fit(undefined, 60); // all positioned → no layout, just fit
        } else {
          // Nothing saved → full auto layout (fit: true centers the graph).
          cy.layout(layoutOptions(layout)).run();
        }
      }
    }

    applyDimState();
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
    const leftover = filteredThoughts().filter((t) => positions[t.id] === undefined);
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
    if (state.filterAllKbs && t.kb) {
      parts.push('<span class="src-badge" style="border-color:var(--accent);color:var(--accent-text)">' + escHtml(t.kb) + "</span>");
    }
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
    state.bulkSelected = new Set();
    updateBulkBar();
    hideNodePreview();
    const graphMode = mode === "graph";
    const views = [
      { el: graphEl, m: "graph" },
      { el: outlineEl, m: "outline" },
      { el: $("timeline"), m: "timeline" },
      { el: $("review"), m: "review" },
    ];
    for (const v of views) v.el.classList.toggle("hidden", v.m !== mode);
    for (const m of ["graph", "outline", "timeline", "review"]) {
      $("btn-view-" + m).classList.toggle("active", m === mode);
    }
    layoutSelect.classList.toggle("hidden", !graphMode);
    $("btn-graph-tools").classList.toggle("hidden", !graphMode);
    minimapEl.classList.toggle("hidden", !graphMode || !state.showMinimap);
    linkHint.classList.toggle("hidden", !graphMode || state.selected.length !== 2);
    if (mode === "outline") renderOutline();
    else if (mode === "timeline") renderTimeline();
    else if (mode === "review") renderReview();
  }

  function setContentMode(mode) {
    state.contentPreview = mode === "preview";
    $("btn-content-preview").classList.toggle("active", state.contentPreview);
    $("btn-content-source").classList.toggle("active", !state.contentPreview);
    if (state.selectedThought) renderDetailContent(state.selectedThought);
  }

  function buildChildrenMap(edges = state.edges) {
    const map = new Map();
    for (const e of edges) {
      if (!map.has(e.parent_id)) map.set(e.parent_id, []);
      map.get(e.parent_id).push(e.child_id);
    }
    return map;
  }

  function renderOutline() {
    if (state.outlineExpanded === null) {
      state.outlineExpanded = new Set(state.thoughts.map((t) => t.id));
    }
    const visible = filteredThoughts();
    const visibleIds = new Set(visible.map((t) => t.id));
    const fEdges = filteredEdges();
    const children = buildChildrenMap(fEdges);
    const childSet = new Set(fEdges.map((e) => e.child_id));
    const roots = visible.filter((t) => !childSet.has(t.id));

    const container = outlineEl;
    container.innerHTML = "";
    if (visible.length === 0) {
      container.innerHTML = '<div class="outline-empty">' + tr("outline.empty") + '</div>';
      updateOutlineSelection();
      return;
    }
    for (const root of roots) {
      buildOutlineNode(container, root.id, children, 0, new Set(), visibleIds);
    }
    updateOutlineSelection();
  }

  function buildOutlineNode(container, id, children, depth, path, visibleIds) {
    const thought = state.thoughts.find((t) => t.id === id);
    if (!thought) return;
    // Only show descendants that survive the active filter.
    const kids = (children.get(id) || []).filter((kidId) => visibleIds.has(kidId));
    const expanded = state.outlineExpanded.has(id);
    const row = document.createElement("div");
    row.className = "outline-row" + (expanded && kids.length ? " expanded" : "");
    row.dataset.id = id;
    row.style.paddingLeft = (8 + depth * 18) + "px";

    if (!state.filterAllKbs && state.selectMode) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "bulk-cb";
      cb.checked = state.bulkSelected.has(id);
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        if (cb.checked) state.bulkSelected.add(id);
        else state.bulkSelected.delete(id);
        updateBulkBar();
      });
      row.appendChild(cb);
    }

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

    if (state.filterAllKbs && thought.kb) {
      const kbTag = document.createElement("span");
      kbTag.className = "kb-tag";
      kbTag.textContent = thought.kb;
      label.appendChild(kbTag);
    }

    // Compact source + question-type badges after the label, with tooltips.
    const badges = document.createElement("span");
    badges.className = "outline-badges";
    if (thought.source) {
      const sb = document.createElement("span");
      sb.className = "outline-badge";
      sb.textContent = sourceShort(thought.source);
      sb.title = sourceBadgeTip(thought.source);
      sb.style.borderColor = sourceColor(thought.source);
      sb.style.color = sourceColor(thought.source);
      badges.appendChild(sb);
    }
    if (thought.question_type) {
      const ql = thought.question_type.trim().toLowerCase();
      const short = qtypeShort(ql);
      if (short) {
        const qb = document.createElement("span");
        qb.className = "outline-badge";
        qb.textContent = short;
        qb.title = qtypeBadgeTip(ql);
        qb.style.borderColor = qtypeColor(ql);
        qb.style.color = qtypeColor(ql);
        badges.appendChild(qb);
      }
    }
    if (badges.children.length) {
      row.appendChild(badges);
    }

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
        buildOutlineNode(container, kidId, children, depth + 1, nextPath, visibleIds);
      }
    }
  }

  function updateOutlineSelection() {
    const selectedId = state.selectedThought ? state.selectedThought.id : null;
    const rows = outlineEl.querySelectorAll(".outline-row");
    // Compare as strings so composite "<slug>#<id>" ids (All-KBs mode) match.
    rows.forEach((r) => r.classList.toggle("active", String(r.dataset.id) === String(selectedId)));
    if (selectedId != null) {
      const active = outlineEl.querySelector(".outline-row.active");
      if (active) active.scrollIntoView({ block: "nearest" });
    }
  }

  // ------------------------------------------------------------ timeline

  function timelineDayKey(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "?";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function timelineDayLabel(key) {
    if (key === "?") return "";
    const d = new Date(key + "T00:00:00");
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startToday - startDay) / 86400000);
    if (diffDays === 0) return tr("timeline.dateLabel");
    if (diffDays === 1) return tr("timeline.yesterday");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function timelineBulkCheckbox(t) {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "bulk-cb";
    cb.checked = state.bulkSelected.has(t.id);
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) state.bulkSelected.add(t.id);
      else state.bulkSelected.delete(t.id);
      updateBulkBar();
    });
    return cb;
  }

  function renderTimeline() {
    const container = $("timeline");
    const visible = filteredThoughts();
    container.innerHTML = `
      <div class="tl-toolbar">
        <div class="seg-toggle" title="${escAttr(tr("timeline.sortTitle"))}">
          <button class="seg ${state.timelineSort === "created" ? "active" : ""}" data-sort="created">${tr("timeline.created")}</button>
          <button class="seg ${state.timelineSort === "updated" ? "active" : ""}" data-sort="updated">${tr("timeline.updated")}</button>
        </div>
      </div>`;
    container.querySelectorAll("[data-sort]").forEach((btn) => {
      btn.onclick = () => {
        if (state.timelineSort !== btn.dataset.sort) {
          state.timelineSort = btn.dataset.sort;
          renderTimeline();
        }
      };
    });
    if (visible.length === 0) {
      container.insertAdjacentHTML("beforeend", '<div class="outline-empty">' + tr("timeline.empty") + "</div>");
      return;
    }
    const sortField = state.timelineSort === "created" ? "created_at" : "updated_at";
    const byDay = new Map();
    for (const t of visible) {
      const key = timelineDayKey(t[sortField]);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(t);
    }
    const days = [...byDay.keys()].sort().reverse();
    for (const day of days) {
      const group = document.createElement("div");
      group.className = "tl-group";
      const head = document.createElement("div");
      head.className = "tl-date";
      head.textContent = timelineDayLabel(day);
      group.appendChild(head);
      // Newest first within each day, matching the descending day order.
      const rows = byDay.get(day).slice().sort((a, b) => (b[sortField] || "").localeCompare(a[sortField] || ""));
      for (const t of rows) {
        const row = document.createElement("div");
        row.className = "tl-row";
        row.dataset.id = t.id;
        if (!state.filterAllKbs && state.selectMode) row.appendChild(timelineBulkCheckbox(t));
        const label = document.createElement("span");
        label.className = "tl-label";
        label.textContent = fmtTitle(t);
        row.appendChild(label);
        const meta = document.createElement("span");
        meta.className = "tl-meta muted";
        meta.textContent = fmtDateTime(state.timelineSort === "created" ? t.created_at : t.updated_at);
        row.appendChild(meta);
        row.addEventListener("click", () => selectThought(t.id));
        group.appendChild(row);
      }
      container.appendChild(group);
    }
  }

  // ------------------------------------------------------------- review

  function reviewBuckets() {
    const visible = filteredThoughts();
    const fEdges = filteredEdges();
    const childSet = new Set(fEdges.map((e) => e.child_id));
    const orphans = visible.filter((t) => !childSet.has(t.id));

    const cutoff = Date.now() - state.reviewDays * 86400000;
    const stale = visible.filter((t) => {
      const u = new Date(t.updated_at).getTime();
      return !isNaN(u) && u < cutoff;
    });

    // Weakly-connected components; isolated thoughts (no edges) are their own
    // size-1 component and fall out of the largest one.
    const adj = new Map();
    const addAdj = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    for (const e of fEdges) { addAdj(e.parent_id, e.child_id); addAdj(e.child_id, e.parent_id); }
    const visited = new Set();
    const comps = [];
    for (const [node] of adj) {
      if (visited.has(node)) continue;
      const comp = [];
      const stack = [node];
      visited.add(node);
      while (stack.length) {
        const n = stack.pop();
        comp.push(n);
        for (const nb of adj.get(n) || []) {
          if (!visited.has(nb)) { visited.add(nb); stack.push(nb); }
        }
      }
      comps.push(comp);
    }
    const largest = comps.reduce((a, b) => (b.length > a.length ? b : a), []);
    const largestSet = new Set(largest.map(String));
    const disconnected = visible.filter((t) => !largestSet.has(String(t.id)));

    return { orphans, stale, disconnected };
  }

  // True when ancestorId can reach descendantId following parent→child edges.
  function isAncestor(ancestorId, descendantId) {
    if (ancestorId === descendantId) return false;
    const seen = new Set([ancestorId]);
    const stack = [ancestorId];
    while (stack.length) {
      const n = stack.pop();
      for (const e of state.edges) {
        if (e.parent_id === n && !seen.has(e.child_id)) {
          if (e.child_id === descendantId) return true;
          seen.add(e.child_id);
          stack.push(e.child_id);
        }
      }
    }
    return false;
  }

  async function reviewSuggestLinks(row, t, btn) {
    btn.disabled = true;
    btn.textContent = tr("review.linking");
    let data;
    try {
      data = await post("/api/chat/suggest-link", {
        title: t.title, content: t.content, child_id: detailIdFor(t),
      });
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = tr("review.aiLink");
      return;
    }
    btn.style.display = "none";
    renderLinkSuggestions(row, t, data);
  }

  // Shared renderer for the "Suggest parent" flow — used by the review queue,
  // the detail-panel AI menu, and the graph node context menu.
  function renderLinkSuggestions(container, t, data) {
    const existing = new Set(
      state.edges.filter((e) => e.child_id === t.id).map((e) => e.parent_id)
    );
    let valid = (data.suggestions || [])
      .filter((s) => s.parent_id != null && !existing.has(s.parent_id));
    // If a suggested parent is already an ancestor of another suggested parent
    // (the graph links them hierarchically), keep only the most specific one so
    // the orphan isn't linked directly to the whole chain.
    valid = valid.filter((s) => !valid.some((o) => o !== s && isAncestor(s.parent_id, o.parent_id)));
    valid = valid.slice(0, 3);
    const old = container.querySelector(".rev-suggestions");
    if (old) old.remove();
    // The model may also propose a NEW taxonomic chain (broad → specific) that is
    // closer to the orphan than any broad existing thought. Build it whenever
    // present and show it below the existing suggestions.
    const chainBox = renderNewConceptBox(data.new_parents || [], {
      intro: tr("review.newParentsIntro"),
      createLabel: tr("review.createChain"),
      onCreate: async (chosen) => {
        const childId = detailIdFor(t);
        let prevId = null;
        for (const np of chosen) {
          const id = await createOrReuseThought(np);
          if (prevId != null && prevId !== id) {
            await post("/api/links", { parent_id: prevId, child_id: id });
          }
          prevId = id;
        }
        if (prevId != null && prevId !== childId) {
          await post("/api/links", { parent_id: prevId, child_id: childId });
        }
      },
    });
    if (valid.length === 0) {
      if (chainBox) {
        container.appendChild(chainBox);
        return;
      }
      const none = document.createElement("div");
      none.className = "rev-suggestions muted";
      none.textContent = tr("review.noSuggestions");
      container.appendChild(none);
      return;
    }
    const box = document.createElement("div");
    box.className = "rev-suggestions";
    const checked = new Set(valid.map((s) => s.parent_id));
    for (const s of valid) {
      const item = document.createElement("div");
      item.className = "rev-suggestion";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.className = "rev-cb";
      cb.addEventListener("change", () => {
        if (cb.checked) checked.add(s.parent_id);
        else checked.delete(s.parent_id);
        updateLabel();
      });
      item.appendChild(cb);
      const text = document.createElement("span");
      text.className = "rev-sug-text";
      const sname = s.english ? `${s.parent_title || "?"} (${s.english})` : (s.parent_title || "?");
      text.textContent = sname + (s.reason ? " — " + s.reason : "");
      item.appendChild(text);
      box.appendChild(item);
    }
    let acc;
    const updateLabel = () => {
      acc.textContent = tr("review.accept") + (checked.size ? ` (${checked.size})` : "");
      acc.disabled = checked.size === 0;
    };
    acc = document.createElement("button");
    acc.className = "btn";
    updateLabel();
    acc.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      acc.disabled = true;
      const chosen = valid.filter((s) => checked.has(s.parent_id));
      let failed = 0;
      for (const s of chosen) {
        try {
          await post("/api/links", { parent_id: s.parent_id, child_id: detailIdFor(t) });
        } catch (err) {
          failed++;
          toast(err.message);
        }
      }
      acc.textContent = failed ? `✓ ${failed} failed` : "✓";
      await refreshGraph();
      if (state.viewMode === "review") renderReview();
    });
    box.appendChild(acc);
    container.appendChild(box);
    if (chainBox) container.appendChild(chainBox);
  }

  // Runs the "Suggest parent" flow for the currently selected thought and shows
  // the result box in the detail panel. Entry point for both the detail AI menu
  // and the graph node context menu.
  async function suggestParentsForSelected() {
    if (state.filterAllKbs) {
      toast(tr("toast.singleKbOnly"));
      return;
    }
    const t = state.selectedThought;
    if (!t) {
      toast(tr("toast.selectThought"));
      return;
    }
    const box = $("detail-suggestions");
    box.innerHTML = "";
    box.classList.remove("hidden");
    const loading = document.createElement("div");
    loading.className = "rev-suggestions muted";
    loading.textContent = tr("review.linking");
    box.appendChild(loading);
    let data;
    try {
      data = await post("/api/chat/suggest-link", {
        title: t.title, content: t.content, child_id: detailIdFor(t),
      });
    } catch (err) {
      toast(err.message);
      box.innerHTML = "";
      box.classList.add("hidden");
      return;
    }
    renderLinkSuggestions(box, t, data);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Create a thought, or reuse one with the same title (the backend returns 409
  // with existingId). Shared by the parents chain, children, and siblings flows.
  async function createOrReuseThought(np) {
    const reuse = state.thoughts.find(
      (x) => x.title.trim().toLowerCase() === np.title.trim().toLowerCase()
    );
    if (reuse) return reuse.id;
    try {
      const id = await post("/api/thoughts", { title: np.title, content: np.content || np.reason || "" });
      return id.id;
    } catch (err) {
      if (err.existingId) return err.existingId;
      throw err;
    }
  }

  // Builds a "create these new concepts & link them" box with checkboxes and a
  // create button. Returns the box element (NOT appended) or null when empty;
  // the caller decides placement. opts: {intro, createLabel, onCreate(chosen)}.
  function renderNewConceptBox(items, opts) {
    const RANK_ORDER = { kingdom: 0, phylum: 1, class: 2, order: 3, family: 4, genus: 5, species: 6 };
    const sorted = (items || []).slice()
      .sort((a, b) => (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99));
    if (sorted.length === 0) return null;
    const box = document.createElement("div");
    box.className = "rev-suggestions";
    const intro = document.createElement("div");
    intro.className = "rev-sug-text muted";
    intro.textContent = opts.intro;
    box.appendChild(intro);
    const checked = new Set(sorted.map((n) => n.title.trim().toLowerCase()));
    for (const np of sorted) {
      const item = document.createElement("div");
      item.className = "rev-suggestion";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.className = "rev-cb";
      cb.addEventListener("change", () => {
        const key = np.title.trim().toLowerCase();
        if (cb.checked) checked.add(key);
        else checked.delete(key);
        updateLabel();
      });
      item.appendChild(cb);
      const text = document.createElement("span");
      text.className = "rev-sug-text";
      const npname = np.english ? `${np.title} (${np.english})` : np.title;
      const parts = [npname];
      if (np.rank) parts.push(np.rank);
      if (np.reason) parts.push(np.reason);
      text.textContent = parts.join(" — ");
      item.appendChild(text);
      box.appendChild(item);
    }
    let acc;
    const count = () => sorted.filter((x) => checked.has(x.title.trim().toLowerCase())).length;
    const updateLabel = () => {
      const n = count();
      acc.textContent = opts.createLabel + (n ? ` (${n})` : "");
      acc.disabled = n === 0;
    };
    acc = document.createElement("button");
    acc.className = "btn";
    updateLabel();
    acc.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      acc.disabled = true;
      try {
        const chosen = sorted.filter((x) => checked.has(x.title.trim().toLowerCase()));
        await opts.onCreate(chosen);
        acc.textContent = "✓";
        await refreshGraph();
        if (state.viewMode === "review") renderReview();
      } catch (err) {
        updateLabel();
        toast(err.message);
      }
    });
    box.appendChild(acc);
    return box;
  }

  // Renders AI-suggested children and siblings for the selected thought, into the
  // shared detail-panel suggestions box. Children link under t; siblings link
  // under t's existing parents.
  function renderRelationSuggestions(container, t, data) {
    const old = container.querySelector(".rev-suggestions");
    if (old) old.remove();
    const childIds = new Set(
      state.edges.filter((e) => e.parent_id === t.id).map((e) => e.child_id)
    );
    const parentIds = state.edges.filter((e) => e.child_id === t.id).map((e) => e.parent_id);
    const existingSiblings = new Set(
      state.edges.filter((e) => parentIds.includes(e.parent_id)).map((e) => e.child_id)
    );
    existingSiblings.delete(t.id);

    const childSugs = (data.children || [])
      .filter((s) => s.child_id != null && !childIds.has(s.child_id))
      .slice(0, 3);
    const siblingSugs = (data.siblings || [])
      .filter((s) => s.sibling_id != null && !existingSiblings.has(s.sibling_id))
      .slice(0, 3);
    let nothing = true;

    if (childSugs.length > 0) {
      nothing = false;
      const box = document.createElement("div");
      box.className = "rev-suggestions";
      const intro = document.createElement("div");
      intro.className = "rev-sug-text muted";
      intro.textContent = tr("rel.childrenSection");
      box.appendChild(intro);
      const checked = new Set(childSugs.map((s) => s.child_id));
      for (const s of childSugs) {
        const item = document.createElement("div");
        item.className = "rev-suggestion";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = true;
        cb.className = "rev-cb";
        cb.addEventListener("change", () => {
          if (cb.checked) checked.add(s.child_id);
          else checked.delete(s.child_id);
          updateLabel();
        });
        item.appendChild(cb);
        const text = document.createElement("span");
        text.className = "rev-sug-text";
        const sname = s.english ? `${s.child_title || "?"} (${s.english})` : (s.child_title || "?");
        text.textContent = sname + (s.reason ? " — " + s.reason : "");
        item.appendChild(text);
        box.appendChild(item);
      }
      let acc;
      const updateLabel = () => {
        acc.textContent = tr("rel.addChildren") + (checked.size ? ` (${checked.size})` : "");
        acc.disabled = checked.size === 0;
      };
      acc = document.createElement("button");
      acc.className = "btn";
      updateLabel();
      acc.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        acc.disabled = true;
        const chosen = childSugs.filter((s) => checked.has(s.child_id));
        let failed = 0;
        for (const s of chosen) {
          try {
            await post("/api/links", { parent_id: detailIdFor(t), child_id: s.child_id });
          } catch (err) {
            failed++;
            toast(err.message);
          }
        }
        acc.textContent = failed ? `✓ ${failed} failed` : "✓";
        await refreshGraph();
        if (state.viewMode === "review") renderReview();
      });
      box.appendChild(acc);
      container.appendChild(box);
    }
    const newChildBox = renderNewConceptBox(data.new_children || [], {
      intro: tr("rel.newChildrenIntro"),
      createLabel: tr("rel.createChildren"),
      onCreate: async (chosen) => {
        const tid = detailIdFor(t);
        for (const np of chosen) {
          const id = await createOrReuseThought(np);
          await post("/api/links", { parent_id: tid, child_id: id });
        }
      },
    });
    if (newChildBox) {
      nothing = false;
      container.appendChild(newChildBox);
    }

    const sibBox = document.createElement("div");
    sibBox.className = "rev-suggestions";
    const sibIntro = document.createElement("div");
    sibIntro.className = "rev-sug-text muted";
    sibIntro.textContent = tr("rel.siblingsSection");
    sibBox.appendChild(sibIntro);
    if (parentIds.length === 0) {
      const note = document.createElement("div");
      note.className = "rev-sug-text muted";
      note.textContent = tr("rel.siblingsNoParent");
      sibBox.appendChild(note);
      container.appendChild(sibBox);
    } else {
      if (siblingSugs.length > 0) {
        nothing = false;
        const checked = new Set(siblingSugs.map((s) => s.sibling_id));
        for (const s of siblingSugs) {
          const item = document.createElement("div");
          item.className = "rev-suggestion";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = true;
          cb.className = "rev-cb";
          cb.addEventListener("change", () => {
            if (cb.checked) checked.add(s.sibling_id);
            else checked.delete(s.sibling_id);
            updateLabel();
          });
          item.appendChild(cb);
          const text = document.createElement("span");
          text.className = "rev-sug-text";
          const sname = s.english ? `${s.sibling_title || "?"} (${s.english})` : (s.sibling_title || "?");
          text.textContent = sname + (s.reason ? " — " + s.reason : "");
          item.appendChild(text);
          sibBox.appendChild(item);
        }
        let acc;
        const updateLabel = () => {
          acc.textContent = tr("rel.addSiblings") + (checked.size ? ` (${checked.size})` : "");
          acc.disabled = checked.size === 0;
        };
        acc = document.createElement("button");
        acc.className = "btn";
        updateLabel();
        acc.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          acc.disabled = true;
          const chosen = siblingSugs.filter((s) => checked.has(s.sibling_id));
          const uniqueParents = [...new Set(parentIds)];
          let failed = 0;
          for (const s of chosen) {
            for (const pid of uniqueParents) {
              try {
                await post("/api/links", { parent_id: pid, child_id: s.sibling_id });
              } catch (err) {
                failed++;
                toast(err.message);
              }
            }
          }
          acc.textContent = failed ? `✓ ${failed} failed` : "✓";
          await refreshGraph();
          if (state.viewMode === "review") renderReview();
        });
        sibBox.appendChild(acc);
        container.appendChild(sibBox);
      }
      const newSibBox = renderNewConceptBox(data.new_siblings || [], {
        intro: tr("rel.newSiblingsIntro"),
        createLabel: tr("rel.createSiblings"),
        onCreate: async (chosen) => {
          const uniqueParents = [...new Set(parentIds)];
          for (const np of chosen) {
            const id = await createOrReuseThought(np);
            for (const pid of uniqueParents) {
              await post("/api/links", { parent_id: pid, child_id: id });
            }
          }
        },
      });
      if (newSibBox) {
        nothing = false;
        container.appendChild(newSibBox);
      }
    }

    if (nothing) {
      const none = document.createElement("div");
      none.className = "rev-suggestions muted";
      none.textContent = tr("review.noSuggestions");
      container.appendChild(none);
    }
  }

  // Runs the "Suggest children & siblings" flow for the currently selected thought
  // and shows the result box in the detail panel. Entry point for both the detail
  // AI menu and the graph node context menu.
  async function suggestRelationsForSelected() {
    if (state.filterAllKbs) {
      toast(tr("toast.singleKbOnly"));
      return;
    }
    const t = state.selectedThought;
    if (!t) {
      toast(tr("toast.selectThought"));
      return;
    }
    const box = $("detail-suggestions");
    box.innerHTML = "";
    box.classList.remove("hidden");
    const loading = document.createElement("div");
    loading.className = "rev-suggestions muted";
    loading.textContent = tr("review.linking");
    box.appendChild(loading);
    let data;
    try {
      data = await post("/api/chat/suggest-relations", {
        title: t.title, content: t.content, thought_id: detailIdFor(t),
      });
    } catch (err) {
      toast(err.message);
      box.innerHTML = "";
      box.classList.add("hidden");
      return;
    }
    renderRelationSuggestions(box, t, data);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function reviewRow(t) {
    const row = document.createElement("div");
    row.className = "rev-row";
    row.dataset.id = t.id;
    if (!state.filterAllKbs && state.selectMode) row.appendChild(timelineBulkCheckbox(t));
    const label = document.createElement("span");
    label.className = "tl-label";
    label.textContent = fmtTitle(t);
    row.appendChild(label);
    row.addEventListener("click", () => selectThought(t.id));
    if (!state.filterAllKbs) {
      const aiBtn = document.createElement("button");
      aiBtn.className = "btn subtle rev-ai";
      aiBtn.textContent = tr("review.aiLink");
      aiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        reviewSuggestLinks(row, t, aiBtn);
      });
      row.appendChild(aiBtn);
    }
    return row;
  }

  function renderReview() {
    const container = $("review");
    const { orphans, stale, disconnected } = reviewBuckets();
    const tabs = [
      { id: "orphans", count: orphans.length, label: tr("review.orphans") },
      { id: "stale", count: stale.length, label: tr("review.stale") },
      { id: "disconnected", count: disconnected.length, label: tr("review.disconnected") },
    ];
    container.innerHTML = `
      <div class="rev-tabs">
        ${tabs.map((t) => `
          <button class="rev-tab ${state.reviewTab === t.id ? "active" : ""}" data-tab="${t.id}">
            ${t.label} <span class="rev-count">${t.count}</span>
          </button>`).join("")}
        ${state.reviewTab === "stale" ? `
          <label class="rev-days">${tr("review.staleDays")}
            <select id="rev-days">
              ${[7, 30, 90].map((d) => `<option value="${d}" ${d === state.reviewDays ? "selected" : ""}>${d}</option>`).join("")}
            </select>
          </label>` : ""}
      </div>`;
    container.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.onclick = () => { if (state.reviewTab !== btn.dataset.tab) { state.reviewTab = btn.dataset.tab; renderReview(); } };
    });
    const daysSel = container.querySelector("#rev-days");
    if (daysSel) daysSel.onchange = () => { state.reviewDays = Number(daysSel.value); renderReview(); };

    const list = state.reviewTab === "orphans" ? orphans : state.reviewTab === "stale" ? stale : disconnected;
    if (list.length === 0) {
      container.insertAdjacentHTML("beforeend", '<div class="outline-empty">' + tr("review.empty") + "</div>");
      return;
    }
    for (const t of list) container.appendChild(reviewRow(t));
  }

  function getSelectedThoughts() {
    return cy.nodes(":selected").map((n) => n.data("thought"));
  }

  async function updateSelectionUI() {
    const sel = getSelectedThoughts();
    state.selectedThought = sel[0] || null;
    state.selected = cy.nodes(":selected").map((n) => n.id());

    // Focus follows the selection. Guarded so re-renders (which restore the
    // selection atomically via node element data) don't loop.
    if (state.focusMode !== "off") {
      const rootId = state.selectedThought ? String(state.selectedThought.id) : null;
      if (rootId !== state._lastFocusRootId) {
        state._lastFocusRootId = rootId;
        applyFilters();
      }
    }

    // In All-KBs mode, selecting a thought from another KB switches to that KB
    // first so the detail panel/editing/chat context all target it directly.
    const t = state.selectedThought;
    if (state.filterAllKbs && t && t.kb && t.kb !== currentKbName()) {
      switchToThoughtKb(t);
      return;
    }

    const bothSelected = sel.length === 2;
    linkHint.classList.toggle("hidden", !bothSelected);
    if (bothSelected) {
      linkHint.textContent =
        tr("toolbar.linkHint", { a: short(sel[0].title), b: short(sel[1].title) });
    }
    // Cross-KB linking is out of scope; the backend /api/links is current-KB only.
    btnLink.disabled = !bothSelected || state.filterAllKbs;

    const ctx = state.selectedThought;
    const enabled = ctxEnabled.checked;
    ctxLabel.textContent = enabled && ctx
      ? tr("chat.contextPrefix") + short(ctx.title)
      : tr("chat.useContext");
    ctxEnabled.disabled = !ctx;

    if (ctx) loadThoughtDetail(detailIdFor(ctx));
    else showDetail(null);
    updateOutlineSelection();
    loadFollowups();
    recenterMindmap();

    // In graph view the multi-select owns bulk selection (checkboxes own it in
    // outline/timeline/review). Cross-KB selections are excluded: bulk ops are
    // current-KB only, matching the backend.
    if (state.viewMode === "graph") {
      state.bulkSelected = new Set(
        state.filterAllKbs ? [] : getSelectedThoughts().map((t) => detailIdFor(t))
      );
      updateBulkBar();
    }
  }

  // Switch the active KB to a cross-KB thought's home KB, then re-select it so
  // the normal (numeric-id) detail path takes over. The All-KBs view stays up.
  async function switchToThoughtKb(t) {
    try {
      await put("/api/kbs/current", { name: t.kb });
      await loadKbList();
      await refreshGraph();
      selectThought(t.id);
    } catch (err) {
      toast(err.message);
      // Release the dangling selection so the graph doesn't stay "stuck".
      cy.nodes().unselect();
      updateSelectionUI();
    }
  }

  let mindmapTimer = null;
  function recenterMindmap() {
    if (state.viewMode !== "graph" || layoutSelect.value !== "mindmap") return;
    const sel = state.selectedThought;
    clearTimeout(mindmapTimer);
    mindmapTimer = setTimeout(() => {
      cy.layout(layoutOptions("mindmap")).run();
      if (sel) {
        const node = cy.getElementById(sel.id);
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
      if (state.selectedThought && detailIdFor(state.selectedThought) === id) {
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

  // persist manual node positions when a drag ends
  cy.on("dragfree", "node", (evt) => saveNodePosition(evt.target));

  // ---- expand-neighbors (dim) mode ------------------------------------
  cy.on("dbltap", "node", (evt) => {
    const id = evt.target.id();
    if (state.expandNode === id) clearExpand();
    else { state.expandNode = id; applyDimState(); }
  });
  cy.on("tap", (evt) => {
    if (evt.target === cy && state.expandNode != null) clearExpand();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.expandNode != null) clearExpand();
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
    const node = cy.getElementById(id);
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

  // Render the detail content in the current mode: rendered markdown preview
  // (default) or raw source. Escapes HTML in source mode so markup shows as-is.
  function renderDetailContent(t) {
    const text = displayContent(t) || "";
    const placeholder = tr("detail.noContent");
    if (state.contentPreview && window.marked) {
      detailContent.innerHTML = marked.parse(text || placeholder);
      return;
    }
    const el = document.createElement("pre");
    el.textContent = text || placeholder;
    detailContent.innerHTML = "";
    detailContent.appendChild(el);
  }

  // ------------------------------------------------------------ media

  // Codecs a <video> element can decode in modern browsers.
  const BROWSER_VIDEO_CODECS = new Set(["avc1", "avc3", "hvc1", "hev1", "vp09", "av01", "dvh1", "dvhe"]);

  function mediaTypeClass(mime) {
    if (!mime) return "file";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime === "application/pdf") return "pdf";
    return "file";
  }

  // Rendered media element for the detail panel (image / video / audio / PDF).
  function mediaElement(media) {
    const url = "/media/" + media.id;
    if (media.mime_type && media.mime_type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = media.filename || "";
      img.loading = "lazy";
      img.className = "media-preview media-image";
      return img;
    }
    if (media.mime_type && media.mime_type.startsWith("video/")) {
      const wrap = document.createElement("div");
      wrap.className = "media-video-wrap";
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.preload = "metadata";
      video.className = "media-preview media-video";
      wrap.appendChild(video);
      const unsupported = media.codec && !BROWSER_VIDEO_CODECS.has(media.codec);
      if (unsupported) {
        const warn = document.createElement("div");
        warn.className = "media-codec-warn";
        warn.textContent = tr("detail.mediaCodecWarn", { codec: media.codec });
        wrap.appendChild(warn);
      }
      return wrap;
    }
    if (media.mime_type && media.mime_type.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";
      audio.className = "media-preview media-audio";
      return audio;
    }
    if (media.mime_type === "application/pdf") {
      const embed = document.createElement("iframe");
      embed.src = url;
      embed.className = "media-preview media-pdf";
      embed.title = media.filename || "";
      return embed;
    }
    // Non-previewable files: a download link styled like a tile.
    const a = document.createElement("a");
    a.href = url;
    a.download = media.filename || "";
    a.className = "media-file-tile";
    a.textContent = "⬇ " + (media.filename || "file");
    return a;
  }

  async function loadThoughtMedia(id) {
    try {
      const media = await api("/api/thoughts/" + id + "/media");
      if (state.selectedThought && detailIdFor(state.selectedThought) === id) {
        renderThoughtMedia(media);
      }
    } catch (e) { /* selection may have changed */ }
  }

  function renderThoughtMedia(mediaList) {
    if (!mediaList) mediaList = [];
    detailMedia.innerHTML = "";
    if (mediaList.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = tr("detail.mediaNone");
      detailMedia.appendChild(p);
      return;
    }
    mediaList.forEach((media) => {
      const card = document.createElement("div");
      card.className = "media-card";

      const el = mediaElement(media);
      card.appendChild(el);

      const cap = document.createElement("div");
      cap.className = "media-cap";

      const name = document.createElement("span");
      name.className = "media-name";
      name.textContent = media.filename || "file";
      name.title = media.filename || "";
      cap.appendChild(name);

      const size = document.createElement("span");
      size.className = "media-size";
      size.textContent = fmtBytes(media.size_bytes);
      cap.appendChild(size);

      const open = document.createElement("button");
      open.className = "media-open";
      open.textContent = "↗";
      open.title = tr("detail.mediaOpenTitle");
      open.onclick = () => { window.open("/media/" + media.id, "_blank"); };
      cap.appendChild(open);

      const delBtn = document.createElement("button");
      delBtn.className = "media-del";
      delBtn.textContent = "✕";
      delBtn.title = tr("detail.mediaDeleteTitle");
      delBtn.onclick = async () => {
        try {
          const resp = await api("/api/media/" + media.id, { method: "DELETE" });
          if (resp && resp.file_removed === false) {
            toast(tr("detail.mediaDeleteWarn"));
          } else {
            toast(tr("detail.mediaDeleted"));
          }
          await loadThoughtMedia(detailIdFor(state.selectedThought));
        } catch (err) { alert(err.message); }
      };
      cap.appendChild(delBtn);

      card.appendChild(cap);
      detailMedia.appendChild(card);
    });
  }

  async function uploadMedia(files) {
    const t = state.selectedThought;
    if (!t || !files || files.length === 0) return;
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    toast(tr("detail.mediaUploading"));
    try {
      await api("/api/thoughts/" + detailIdFor(t) + "/media", {
        method: "POST",
        body: form,
        headers: {}, // let the browser set the multipart boundary
      });
      toast(tr("detail.mediaUploaded", { n: files.length, s: files.length !== 1 ? "s" : "" }));
      await loadThoughtMedia(detailIdFor(t));
    } catch (err) {
      toast(tr("detail.mediaFailed", { message: err.message || "" }));
    }
  }

  function fmtBytes(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    const units = ["KB", "MB", "GB"];
    let v = bytes / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + " " + units[u];
  }

  function initMediaUI() {
    mediaDropzone.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") mediaFileInput.click();
    });
    mediaDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      mediaDropzone.classList.add("dragover");
    });
    mediaDropzone.addEventListener("dragleave", (e) => {
      if (!mediaDropzone.contains(e.relatedTarget)) mediaDropzone.classList.remove("dragover");
    });
    mediaDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      mediaDropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files.length) {
        uploadMedia(e.dataTransfer.files);
      }
    });
    mediaFileInput.addEventListener("change", (e) => {
      if (e.target.files.length) uploadMedia(e.target.files);
      e.target.value = "";
    });
  }

  // Which thoughts mention this thought's title in their content but aren't
  // already linked to it. A "linked" thought is a direct parent or child
  // (siblings are not linked to each other). Match against the raw English
  // text first; if the UI is Romanian, also match the Romanian content.
  function computeBacklinks(t) {
    if (!t) return [];
    // The thought's linked neighbours come from the live edges so this works
    // with composite ids (All-KBs mode) as well as the detail payload's ids.
    const linkedIds = new Set();
    for (const e of state.edges) {
      if (e.parent_id === t.id) linkedIds.add(e.child_id);
      if (e.child_id === t.id) linkedIds.add(e.parent_id);
    }
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
    let t;
    if (state.filterAllKbs && Number.isInteger(id)) {
      t = state.thoughts.find((x) => x.orig_id === id);
    } else {
      t = state.thoughts.find((x) => x.id === id);
    }
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

  // Compact badge abbreviations for the thought description. The tooltip
  // (title) carries the full label + description so the letters stay readable.
  const SOURCE_SHORT = { manual: "M", generated: "G", prompt: "P", extract: "E", unknown: "?" };
  const QTYPE_SHORT = {
    scientific: "S", practical: "P", comparative: "Co",
    historical: "H", causal: "Ca", critical: "Cr",
  };
  function sourceShort(source) {
    return SOURCE_SHORT[source] || (SOURCE_INFO[source] ? source.slice(0, 2).toUpperCase() : "?");
  }
  function qtypeShort(qtype) {
    return QTYPE_SHORT[qtype] || "";
  }
  function sourceBadgeTip(source) {
    return sourceLabel(source) + " — " + sourceDesc(source);
  }
  function qtypeBadgeTip(qtype) {
    return qtypeLabel(qtype) + " — " + qtypeDesc(qtype);
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

    const detailSug = $("detail-suggestions");
    detailSug.innerHTML = "";
    detailSug.classList.add("hidden");

    detailTitle.textContent = fmtTitle(t);
    detailId.textContent = "#" + t.id;
    const srcBadge = $("detail-source");
    if (t.source) {
      srcBadge.textContent = sourceLabel(t.source);
      srcBadge.title = "";
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
      qtypeBadge.title = "";
      qtypeBadge.style.borderColor = "#3b6fd4";
      qtypeBadge.style.color = "#3b6fd4";
      qtypeBadge.classList.remove("hidden");
    } else {
      qtypeBadge.classList.add("hidden");
    }
    detailMeta.textContent =
      tr("detail.created") + fmtDate(t.created_at) +
      (t.updated_at && t.updated_at !== t.created_at ? tr("detail.updated") + fmtDate(t.updated_at) : "");
    renderDetailContent(t);

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
        const full = state.filterAllKbs
          ? (compositeThoughtFor(currentKbName(), p.id) || p)
          : (state.thoughts.find((x) => x.id === p.id) || p);
        const count = full.children ? "(" + full.children.length + ")" : "";
        ul.appendChild(thoughtRow(full, count));
      });
    };
    fill(detailParents, t.parents || [], tr("detail.noParent"));
    fill(detailChildren, t.children || [], tr("detail.noChildren"));
    fill(detailSiblings, t.siblings || [], tr("detail.noSiblings"));
    renderBacklinks(t);
    renderThoughtMedia(t.media || []);
    loadThoughtMedia(detailIdFor(t));
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
            const fresh = await api("/api/thoughts/" + detailIdFor(cur) + "/comments");
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
      await post("/api/thoughts/" + detailIdFor(t) + "/comments", { text });
      input.value = "";
      const fresh = await api("/api/thoughts/" + detailIdFor(t) + "/comments");
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

  function fmtDateTime(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
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
      contextId = detailIdFor(state.selectedThought);
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
        $("btn-save-prompt").disabled = false;
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
      parentIds.push(detailIdFor(state.selectedThought));
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
          if (!created) return; // declined (possible duplicate) or exact-title dup — toast already shown
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
    downloadBlob(md, "text/markdown;charset=utf-8", safeFilename(pairs[pairs.length - 1].prompt, "chat-export") + ".md");
    toast(tr("chat.exportDone"));
  }

  function safeFilename(s, fallback) {
    return (s || "").replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || fallback;
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadKbMarkdown() {
    try {
      const resp = await fetch("/api/export?format=md");
      if (!resp.ok) throw new Error(resp.statusText);
      const md = await resp.text();
      downloadBlob(md, "text/markdown;charset=utf-8", safeFilename(currentKbName(), "brainforest") + ".md");
      toast(tr("export.done"));
    } catch (err) { toast(err.message); }
  }

  async function downloadThought(format, id, title) {
    try {
      const resp = await fetch("/api/thoughts/" + id + "/export?format=" + format);
      if (!resp.ok) throw new Error(resp.statusText);
      const text = await resp.text();
      const ext = format === "json" ? ".json" : ".md";
      const type = format === "json" ? "application/json" : "text/markdown;charset=utf-8";
      downloadBlob(text, type, "thought-" + id + "-" + safeFilename(title, "thought") + ext);
      toast(tr("export.done"));
    } catch (err) { toast(err.message); }
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
      const s = (data.suggestions && data.suggestions[0]) || null;
      if (!s) {
        bar.classList.add("hidden");
        return;
      }
      const select = $("save-target");
      select.innerHTML = BASE_SAVE_TARGETS.map(
        (o) => `<option value="${o.value}">${tr(o.key)}</option>`
      ).join("");
      const sel = document.createElement("option");
      sel.value = "suggestion";
      sel.selected = true;
      sel.textContent = tr("toast.suggestion", { parent: s.parent_title || tr("toast.saveAsRoot") });
      select.appendChild(sel);
      state.suggestion = s;
      text.textContent = s.parent_title
        ? tr("toast.suggestsUnder", { parent: s.parent_title, reason: s.reason || "" })
        : tr("toast.suggestsRoot", { reason: s.reason || "" });
      const saveBtn = $("btn-save-suggestion");
      saveBtn.textContent = s.parent_title
        ? tr("toast.saveUnder", { parent: s.parent_title })
        : tr("toast.saveAsRoot");
      saveBtn.classList.remove("hidden");
    } catch (err) {
      // suggestion is a nicety — hide quietly on failure
      bar.classList.add("hidden");
    }
  }

  // ------------------------------------------------- connect bar

  function hideConnectBar() {
    $("connect-bar").classList.add("hidden");
    $("connect-bar-buttons").innerHTML = "";
  }

  // Suggest 2-3 existing thoughts a newly-created thought could link under as
  // parents. Fire-and-forget; a failed or empty suggestion just hides the bar.
  async function suggestLinksFor(thought) {
    const bar = $("connect-bar");
    const wrap = $("connect-bar-buttons");
    wrap.innerHTML = "";
    bar.classList.remove("hidden");
    $("connect-bar-title").textContent = tr("connect.title");
    const stateId = (state.connectThoughtId = thought.id);
    let data;
    try {
      data = await post("/api/chat/suggest-link", {
        title: thought.title,
        content: thought.content,
        child_id: thought.id,
      });
    } catch (err) {
      hideConnectBar();
      return;
    }
    if (stateId !== state.connectThoughtId) return; // superseded by a newer create
    const existing = new Set((thought.parents || []).map((p) => p.id));
    const valid = (data.suggestions || [])
      .filter((s) => s.parent_id != null && !existing.has(s.parent_id))
      .slice(0, 3);
    if (valid.length === 0) {
      hideConnectBar();
      return;
    }
    valid.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = tr("connect.button", { parent: s.parent_title });
      btn.title = s.reason || "";
      btn.onclick = async () => {
        try {
          await post("/api/links", { parent_id: s.parent_id, child_id: thought.id });
          btn.classList.add("linked");
          btn.disabled = true;
          btn.textContent = tr("conn.linkedMark");
          await refreshGraph();
          if (state.selectedThought && detailIdFor(state.selectedThought) === thought.id) {
            await loadThoughtDetail(thought.id);
          }
          toast(tr("toast.linked", { child: thought.title, parent: s.parent_title }));
        } catch (err) {
          btn.classList.add("linked");
          btn.disabled = true; // e.g. cycle 409 — drop the suggestion quietly
          toast(err.message);
        }
      };
      wrap.appendChild(btn);
    });
  }

  // ------------------------------------------------------------- modal

  function openModal(title, bodyHtml, handlers) {
    const modalEl = $("modal");
    if (handlers && handlers.modalClass) modalEl.classList.add(handlers.modalClass);
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalOverlay.classList.remove("hidden");
    const close = () => {
      modalOverlay.classList.add("hidden");
      modalBody.innerHTML = "";
      if (handlers && handlers.modalClass) modalEl.classList.remove(handlers.modalClass);
      handlers && handlers.cleanup && handlers.cleanup();
    };
    $("modal-close").onclick = close;
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) close(); };
    return { close, body: modalBody };
  }

  function openShortcutsModal() {
    const key = (k) => `<span class="kbd">${k}</span>`;
    const row = (label, keys) => `
      <div class="shortcut-row">
        <span>${label}</span>
        <span class="shortcut-keys">${keys}</span>
      </div>`;
    openModal(tr("shortcuts.title"), `
      ${row(tr("shortcuts.newThought"), key("N"))}
      ${row(tr("shortcuts.editThought"), key("Ctrl") + key("E"))}
      ${row(tr("shortcuts.deleteThought"), key("Del"))}
    `);
  }

  function newThoughtModal(parentThought, prefill) {
    const heading = parentThought
      ? tr("modal.newChildOf", { title: short(parentThought.title) })
      : tr("modal.newThought");
    const m = openModal(heading, `
      <div class="form-row">
        <label>${tr("prompt.title")}</label>
        <input type="text" id="m-title" autofocus value="${escAttr((prefill && prefill.title) || "")}" />
      </div>
      <div class="form-row">
        <label>${tr("prompt.content")}</label>
        <textarea id="m-content" rows="5">${escHtml((prefill && prefill.content) || "")}</textarea>
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
      const parentIds = parentThought ? [detailIdFor(parentThought)] : [];
      // Close the create modal before any dup-check modal can appear, then
      // reopen prefilled when the save is declined so the user can rename.
      m.close();
      try {
        const created = await createThought({ title, content, parent_ids: parentIds, source: "manual" });
        if (!created) {
          newThoughtModal(parentThought, { title, content });
          return;
        }
        await refreshGraph();
        selectThought(created.id);
        suggestLinksFor(created);
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
        await put("/api/thoughts/" + detailIdFor(t), body);
        await refreshGraph();
        selectThought(t.id);
        loadThoughtDetail(detailIdFor(t));
        m.close();
      } catch (err) { alert(err.message); }
    };
  }

  async function openVersionsModal() {
    const t = state.selectedThought;
    if (!t) return;
    const id = detailIdFor(t);
    let versions = [];
    try {
      const resp = await fetch("/api/thoughts/" + id + "/versions");
      if (!resp.ok) throw new Error(resp.statusText);
      versions = (await resp.json()).versions || [];
    } catch (err) { toast(err.message); return; }
    const m = openModal(tr("versions.title"), `
      <div class="version-list">
        ${versions.length === 0
          ? `<div class="outline-empty">${tr("versions.empty")}</div>`
          : versions.map((v) => `
            <div class="version-row">
              <div class="version-info">
                <div class="version-title">${escHtml(v.title)}</div>
                <div class="version-meta muted">${fmtDateTime(v.created_at)}</div>
                ${v.content ? `<div class="version-snippet">${escHtml(short(v.content, 180))}</div>` : ""}
              </div>
              <button class="btn" data-restore="${v.id}" data-date="${escAttr(fmtDateTime(v.created_at))}">${tr("versions.restore")}</button>
            </div>`).join("")}
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.close")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelectorAll("[data-restore]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(tr("versions.restoreConfirm", { date: btn.dataset.date }))) return;
        try {
          await post("/api/thoughts/" + id + "/restore-version", { version_id: Number(btn.dataset.restore) });
          await refreshGraph();
          if (state.selectedThought) {
            selectThought(state.selectedThought.id);
            loadThoughtDetail(id);
          }
          m.close();
          toast(tr("versions.restored"));
        } catch (err) { toast(err.message); }
      };
    });
  }

  // ------------------------------------------------------------- bulk ops

  function bulkIds() {
    return [...state.bulkSelected];
  }

  function updateBulkBar() {
    const n = state.bulkSelected.size;
    bulkBar.classList.toggle("hidden", n === 0);
    if (n > 0) bulkCount.textContent = tr("bulk.selected", { n });
  }

  function bulkChildrenMap() {
    const map = new Map();
    for (const e of state.edges) {
      if (!map.has(e.parent_id)) map.set(e.parent_id, []);
      map.get(e.parent_id).push(e.child_id);
    }
    return map;
  }

  async function bulkDelete() {
    const ids = bulkIds();
    if (!ids.length) return;
    const children = bulkChildrenMap();
    const hasChildren = ids.some((id) => (children.get(id) || []).length > 0);
    const msg = hasChildren
      ? tr("bulk.deleteConfirmCascade", { n: ids.length })
      : tr("bulk.deleteConfirm", { n: ids.length });
    if (!confirm(msg)) return;
    try {
      const res = await post("/api/thoughts/bulk-delete", { ids, cascade: hasChildren });
      state.bulkSelected = new Set();
      updateBulkBar();
      await refreshGraph();
      toast(tr("bulk.deleted", { n: (res.deleted || []).length }));
    } catch (err) { toast(err.message); }
  }

  function bulkMove() {
    const ids = bulkIds();
    if (!ids.length) return;
    const idSet = new Set(ids);
    const opts = filteredThoughts()
      .filter((t) => !idSet.has(detailIdFor(t)))
      .map((t) => `<option value="${detailIdFor(t)}">${escHtml(short(fmtTitle(t), 60))}</option>`)
      .join("");
    if (!opts) { toast(tr("bulk.noTarget")); return; }
    const m = openModal(tr("bulk.moveTitle"), `
      <div class="form-row">
        <label>${tr("bulk.moveTarget")}</label>
        <select id="bm-target">${opts}</select>
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.cancel")}</button>
        <button class="btn primary" id="bm-save">${tr("bulk.move")}</button>
      </div>
    `);
    m.body.querySelector("[data-close]").onclick = m.close;
    m.body.querySelector("#bm-save").onclick = async () => {
      const target = Number(m.body.querySelector("#bm-target").value);
      if (!target) return;
      try {
        const res = await post("/api/thoughts/bulk-move", { ids, target_id: target });
        state.bulkSelected = new Set();
        updateBulkBar();
        await refreshGraph();
        m.close();
        const extra = res.skipped && res.skipped.length
          ? " · " + tr("bulk.skipped", { n: res.skipped.length })
          : "";
        toast(tr("bulk.moved", { n: res.moved.length }) + extra);
      } catch (err) { toast(err.message); }
    };
  }

  async function bulkExport() {
    const ids = bulkIds();
    if (!ids.length) return;
    try {
      const payload = await post("/api/thoughts/bulk-export", { ids });
      downloadBlob(JSON.stringify(payload, null, 2), "application/json", "thoughts-bulk.json");
    } catch (err) { toast(err.message); }
  }

  function bulkClear() {
    state.bulkSelected = new Set();
    updateBulkBar();
    if (state.viewMode === "graph") {
      cy.nodes().unselect();
    } else if (state.viewMode === "outline") {
      renderOutline();
    } else if (state.viewMode === "timeline") {
      renderTimeline();
    } else if (state.viewMode === "review") {
      renderReview();
    }
  }

  function toggleSelectMode() {
    state.selectMode = !state.selectMode;
    $("btn-select").classList.toggle("active", state.selectMode);
    if (!state.selectMode) {
      state.bulkSelected = new Set();
      if (state.viewMode === "graph" && cy) cy.nodes().unselect();
      updateBulkBar();
    }
    if (state.viewMode === "outline") {
      renderOutline();
    } else if (state.viewMode === "timeline") {
      renderTimeline();
    } else if (state.viewMode === "review") {
      renderReview();
    }
  }

  async function extractIdeas() {
    const t = state.selectedThought;
    if (!t) return;
    const btn = $("btn-extract");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = tr("btn.extracting");
    try {
      const data = await post("/api/thoughts/" + detailIdFor(t) + "/extract", {});
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
        let lastCreated = null;
        for (const idea of checked) {
          const created = await createThought({
            title: idea.title,
            content: idea.summary || "",
            parent_ids: [detailIdFor(parent)],
            source: "extract",
          }, { checkDuplicate: false });
          if (created) { added++; lastCreated = created; }
          else skipped++;
        }
        await refreshGraph();
        selectThought(parent.id);
        m.close();
        const msg = tr("toast.addedChild", { n: added, s: added !== 1 ? "s" : "" }) +
          (skipped ? tr("toast.addedSkipped", { n: skipped }) : "");
        toast(msg);
        if (lastCreated) suggestLinksFor(lastCreated); // one suggestion for the batch
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
      t = await api("/api/thoughts/" + detailIdFor(sel));
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
          const data = await post("/api/thoughts/" + detailIdFor(t) + "/generate-related", { type: rtype });
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
        let lastCreated = null;
        for (const idea of checked) {
          let created;
          if (rtype === "children") {
            created = await createThought({ title: idea.title, content: idea.summary || "", parent_ids: [selected.id], source: "generated" }, { checkDuplicate: false });
          } else if (rtype === "siblings") {
            created = await createThought({ title: idea.title, content: idea.summary || "", parent_ids: [selected.parents[0].id], source: "generated" }, { checkDuplicate: false });
          } else {
            created = await createThought({ title: idea.title, content: idea.summary || "", parent_ids: [], source: "generated" }, { checkDuplicate: false });
            if (created) await post("/api/links", { parent_id: created.id, child_id: selected.id });
          }
          if (created) { added++; lastCreated = created; }
          else skipped++;
        }
        await refreshGraph();
        selectThought(selected.id);
        m.close();
        toast(tr("toast.addedThought", { n: added, s: added !== 1 ? "s" : "" }) +
          (skipped ? tr("toast.addedSkipped", { n: skipped }) : ""));
        if (lastCreated) suggestLinksFor(lastCreated); // one suggestion for the batch
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
      const data = await post("/api/thoughts/" + detailIdFor(t) + "/suggest-title", {});
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
            await put("/api/thoughts/" + detailIdFor(t), body);
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
      const data = await post("/api/thoughts/" + detailIdFor(t) + "/reanalyze", {});
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
          const childPlain = c.child_id;
          const childComp = compositeThoughtFor(currentKbName(), childPlain);
          const oldLink = state.edges.find(
            (e) => e.parent_id === parent.id &&
                   e.child_id === (childComp ? childComp.id : childPlain)
          );
          if (oldLink) await del("/api/links/" + linkBackendId(oldLink));
          await post("/api/links", { parent_id: c.suggested_parent_id, child_id: childPlain });
        } else {
          const c = newChildren[Number(row.dataset.i)];
          await post("/api/links", { parent_id: detailIdFor(parent), child_id: c.child_id });
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
      <div class="form-row checkbox">
        <input type="checkbox" id="s-followups" ${s.auto_followups !== "false" ? "checked" : ""} />
        <label for="s-followups">${tr("settings.autoFollowups")}</label>
      </div>
      <div class="form-row">
        <label>${tr("settings.language")}</label>
        <select id="s-language">
          <option value="en" ${s.language !== "ro" ? "selected" : ""}>English</option>
          <option value="ro" ${s.language === "ro" ? "selected" : ""}>Română</option>
        </select>
      </div>
      <div class="form-row section-title">${tr("settings.embedding")}</div>
      <div class="form-row checkbox">
        <input type="checkbox" id="s-embed-enabled" ${s.embedding_enabled === "true" ? "checked" : ""} />
        <label for="s-embed-enabled">${tr("settings.embeddingEnabled")}</label>
      </div>
      <div class="form-row">
        <label>${tr("settings.embeddingModel")}</label>
        <input type="text" id="s-embed-model" value="${escAttr(s.embedding_model || "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")}" />
      </div>
      <div class="form-row">
        <div class="form-hint" id="s-embed-status"></div>
        <button class="btn" id="s-reembed">${tr("settings.reembed")}</button>
        <div class="form-hint">${tr("settings.reembedHint")}</div>
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
    const embedStatusEl = m.body.querySelector("#s-embed-status");
    const loadEmbedStatus = async () => {
      try {
        const st = await api("/api/search/embeddings/status");
        let text = st.building
          ? tr("settings.reembedStart")
          : tr("settings.embeddingStatus", { embedded: st.embedded ?? 0, total: st.total ?? 0 });
        if (st.enabled && (st.embedded ?? 0) < (st.total ?? 0)) text += " ⚠";
        embedStatusEl.textContent = text;
      } catch (err) { embedStatusEl.textContent = ""; }
    };
    loadEmbedStatus();
    m.body.querySelector("#s-reembed").onclick = async () => {
      const btn = m.body.querySelector("#s-reembed");
      btn.disabled = true;
      embedStatusEl.textContent = tr("settings.reembedStart");
      try {
        await post("/api/search/embeddings/rebuild", {});
        let st = { building: true };
        for (let i = 0; i < 60 && st.building; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          st = await api("/api/search/embeddings/status");
        }
        embedStatusEl.textContent = st.building
          ? tr("settings.reembedStart")
          : tr("settings.reembedDone", { n: st.embedded ?? 0 });
      } catch (err) {
        embedStatusEl.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    };
    m.body.querySelector("#s-save").onclick = async () => {
      try {
        await put("/api/settings", {
          api_key: m.body.querySelector("#s-key").value.trim(),
          model: m.body.querySelector("#s-model").value.trim(),
          temperature: m.body.querySelector("#s-temp").value,
          base_url: m.body.querySelector("#s-base").value.trim(),
          thinking: m.body.querySelector("#s-thinking").checked ? "true" : "false",
          auto_followups: m.body.querySelector("#s-followups").checked ? "true" : "false",
          language: m.body.querySelector("#s-language").value,
          embedding_enabled: m.body.querySelector("#s-embed-enabled").checked ? "true" : "false",
          embedding_model: m.body.querySelector("#s-embed-model").value.trim(),
        });
        await loadSettings();
        applyStaticTranslations();
        m.close();
        await refreshGraph();
        const cur = state.selectedThought;
        if (cur) loadThoughtDetail(detailIdFor(cur));
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
      const data = await post("/api/thoughts/" + detailIdFor(t) + "/generate-content", {});
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
        const data = await post("/api/thoughts/" + detailIdFor(thought) + "/generate-content", {});
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
        await put("/api/thoughts/" + detailIdFor(thought), {
          content: current.content_en,
          content_ro: current.content_ro,
        });
        m.close();
        loadThoughtDetail(detailIdFor(thought));
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
  let currentFollowups = {};  // last rendered {group: [item]} — used to merge on refresh
  const FOLLOWUP_GROUPS = [
    { key: "scientific", label: tr("qtype.scientific") },
    { key: "practical", label: tr("qtype.practical") },
    { key: "comparative", label: tr("qtype.comparative") },
    { key: "historical", label: tr("qtype.historical") },
    { key: "causal", label: tr("qtype.causal") },
    { key: "critical", label: tr("qtype.critical") },
  ];

  function followupChipHtml(item, qtype) {
    const q = item && item.q ? item.q : (typeof item === "string" ? item : "");
    const coveredId = item && item.covered_id;
    const coveredTitle = (item && item.covered_title) || "";
    const badge = coveredId
      ? '<span class="followup-covered">' + escHtml(tr("followups.covered")) + "</span>"
      : "";
    return `<button class="chip${coveredId ? " covered" : ""}" data-type="${qtype}"${coveredId ? ` data-covered="${coveredId}" data-covered-title="${escAttr(coveredTitle)}"` : ""}>` +
      escHtml(q) + badge + "</button>";
  }

  function followupGroupsHtml(byGroup) {
    currentFollowups = byGroup;
    const groupHtml = (g) => {
      const qs = byGroup[g.key] || [];
      return qs.length ? (
        '<div class="followup-group">' +
        '<span class="followup-label">' + escHtml(g.label) + "</span>" +
        qs.map((q) => followupChipHtml(q, g.key)).join("") +
        "</div>"
      ) : "";
    };
    return FOLLOWUP_GROUPS.map(groupHtml).join("");
  }

  function followupBarHtml() {
    return '<div class="followup-bar">' +
      '<button class="followup-refresh" title="' + escAttr(tr("followups.refreshTitle")) + '">↻</button>' +
      "</div>";
  }

  function attachFollowupHandlers(box, ctx) {
    box.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const cid = chip.dataset.covered;
        if (cid) {
          selectThought(Number(cid));
          return;
        }
        state.pendingQuestionType = chip.dataset.type || null;
        promptInput.value = chip.textContent;
        promptInput.focus();
      });
    });
    box.querySelector(".followup-refresh").addEventListener("click", () => refreshFollowups(box, ctx));
  }

  async function refreshFollowups(box, ctx) {
    // Question text is the chip's first text node — textContent includes the
    // "✓ Saved" badge, which must not be sent back as the avoid string.
    const covered = [...box.querySelectorAll(".chip.covered")].map((c) => {
      const first = c.childNodes[0];
      return (first && first.textContent ? first.textContent : c.textContent).trim();
    });
    const btn = box.querySelector(".followup-refresh");
    btn.disabled = true;
    try {
      const freshData = await post("/api/thoughts/" + detailIdFor(ctx) + "/followups", { avoid: covered });
      if (!state.selectedThought || detailIdFor(state.selectedThought) !== detailIdFor(ctx)) return;
      // Merge fresh questions with the still-current non-covered ones so the
      // model omitting a group can't collapse the panel. Fresh wins per slot.
      const merged = {};
      FOLLOWUP_GROUPS.forEach((g) => {
        const fresh = (freshData[g.key] || []).map((q) => (typeof q === "string" ? { q, covered_id: null } : q));
        const freshQs = fresh.map((x) => x.q.toLowerCase());
        const kept = (currentFollowups[g.key] || [])
          .filter((x) => !x.covered_id && !freshQs.includes((x.q || "").toLowerCase()))
          .slice(0, 2);
        merged[g.key] = [...fresh, ...kept].slice(0, 2);
      });
      box.innerHTML = followupBarHtml() + followupGroupsHtml(merged);
      attachFollowupHandlers(box, ctx);
      btn.disabled = false;
    } catch (e) { btn.disabled = false; }
  }

  function loadFollowups() {
    clearTimeout(followupTimer);
    const box = $("followups");
    const ctx = state.selectedThought;
    const enabled = state.settings && state.settings.auto_followups !== "false";
    if (!ctx || !enabled) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = '<span class="followup-hint">' + tr("followups.hint") + '</span>';
    followupTimer = setTimeout(async () => {
      try {
        const data = await post("/api/thoughts/" + detailIdFor(ctx) + "/followups", {});
        if (!state.selectedThought || detailIdFor(state.selectedThought) !== detailIdFor(ctx)) return;
        box.innerHTML = followupBarHtml() + followupGroupsHtml(data);
        attachFollowupHandlers(box, ctx);
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
      $("followups-enabled").checked = state.settings.auto_followups !== "false";
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
    const data = await api(state.filterAllKbs ? "/api/graph?scope=all" : "/api/graph");
    state.thoughts = data.nodes;
    state.edges = data.edges;
    pruneSavedPositions();
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
    const scopeAll = $("search-scope-all").checked;
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
          const url = "/api/search?q=" + encodeURIComponent(q) + (scopeAll ? "&scope=all" : "");
          const data = await api(url);
          if (seq !== searchSeq) return;
          renderSearchResults(data.results || [], "exact", q);
        } catch (err) {
          if (seq === searchSeq) {
            resultsEl.innerHTML = '<div class="search-note">' + escHtml(err.message) + "</div>";
          }
        }
      }, 250);
    } else if (mode === "semantic") {
      clearTimeout(searchTimer);
      resultsEl.innerHTML = '<div class="search-note">' + tr("search.semanticNote") + '</div>';
      searchTimer = setTimeout(async () => {
        try {
          const body = { query: q, mode: "vector" };
          if (scopeAll) body.scope = "all";
          const data = await post("/api/search/semantic", body);
          if (seq !== searchSeq) return;
          renderSearchResults(data.results || [], "semantic", q);
        } catch (err) {
          if (seq === searchSeq) {
            resultsEl.innerHTML = '<div class="search-note">' + escHtml(err.message) + "</div>";
          }
        }
      }, 250);
    } else {
      clearTimeout(searchTimer);
      resultsEl.innerHTML = '<div class="search-note">' + tr("search.aiNote") + '</div>';
      post("/api/search/semantic", scopeAll ? { query: q, scope: "all" } : { query: q }).then((data) => {
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
      const badge = r.kb ? '<span class="search-kb">' + escHtml(r.kb) + "</span>" : "";
      const sub = mode === "ai"
        ? '<div class="reason">' + escHtml(r.reason || "") + "</div>"
        : mode === "semantic"
          ? '<div class="reason">' + escHtml(r.snippet || (r.content_ro || r.content || "").slice(0, 220)) +
            (r.score != null ? ' <span class="search-score">' + Math.round(r.score * 100) + '%</span>' : "") + "</div>"
          : '<div class="reason">' + snippetWithHighlight(r.content_ro || r.content || "", q || "") + "</div>";
      return '<div class="search-row" data-id="' + r.id + '"' +
        (r.kb ? ' data-kb="' + escAttr(r.kb) + '"' : "") + ">" +
        '<div class="s-title">' + escHtml(title) + badge + "</div>" + sub + "</div>";
    }).join("");
    resultsEl.innerHTML = '<div class="search-count">' + tr("search.count", { n: list.length, s: list.length !== 1 ? "s" : "" }) + "</div>" + rows;
    resultsEl.querySelectorAll(".search-row").forEach((row) => {
      row.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        const kb = row.dataset.kb;
        if (kb && kb !== $("kb-select").value) {
          try {
            await switchKb(kb);
          } catch (err) { toast(err.message); }
        }
        // In All-KBs mode, thoughts are keyed by composite ids; resolve the
        // plain search result id to its composite form after the KB switch.
        const plain = Number(row.dataset.id);
        const target = state.filterAllKbs && kb
          ? (compositeThoughtFor(kb, plain) || {}).id
          : plain;
        selectThought(target != null ? target : plain);
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

  function statsBodyHtml(data) {
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

    if (data.total === 0) {
      return '<div class="search-note">' + tr("stats.noThoughts") + '</div>';
    }

    let html = `<div class="stat-total">${tr("stats.total")}<strong>${data.total}</strong></div>`;

    // In All-KBs mode, list each knowledge base with its thought count.
    if (data.scope === "all" && Array.isArray(data.per_kb)) {
      const kbRows = data.per_kb
        .map((kb) => statRowHtml("var(--accent)", escHtml(kb.name), kb.total, null))
        .join("");
      html += `<div class="stat-section">${tr("stats.sectionKbs")}</div>${kbRows}`;
    }

    html += `<div class="stat-section">${tr("stats.sectionThought")}</div>${rows}`
      + `<div class="stat-section">${tr("stats.sectionQuestion")}</div>${qtypeRows}`;
    return html;
  }

  async function showStats() {
    let data;
    try {
      data = await api("/api/stats?scope=all");
    } catch (err) {
      toast(err.message);
      return;
    }
    const bodyEl = document.createElement("div");
    bodyEl.className = "stat-body";
    bodyEl.innerHTML = statsBodyHtml(data);

    const m = openModal(tr("modal.statistics"), `
      <div class="stat-scope">
        <span class="stat-scope-label">${tr("stats.scopeLabel")}</span>
        <div class="seg-toggle" role="group" aria-label="${escAttr(tr("stats.scopeLabel"))}">
          <button type="button" class="seg" data-scope="current">${escHtml(tr("stats.scopeCurrent"))}</button>
          <button type="button" class="seg active" data-scope="all">${escHtml(tr("stats.scopeAll"))}</button>
        </div>
      </div>
      <div class="stat-body-wrap"></div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.close")}</button>
      </div>
    `);
    const wrap = m.body.querySelector(".stat-body-wrap");
    wrap.appendChild(bodyEl);

    // Toggle between the current KB's stats and all KBs combined.
    m.body.querySelectorAll(".seg").forEach((btn) => {
      btn.onclick = async () => {
        const scope = btn.dataset.scope;
        m.body.querySelectorAll(".seg").forEach((b) => b.classList.toggle("active", b === btn));
        try {
          const d = await api(`/api/stats?scope=${scope}`);
          bodyEl.innerHTML = statsBodyHtml(d);
        } catch (err) {
          toast(err.message);
        }
      };
    });

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

  // ------------------------------------------------------- recycle bin + backups

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
  }

  function fmtSize(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function openTrashModal() {
    const m = openModal(tr("trash.title"), `
      <div id="trash-list" class="trash-list">
        <p class="muted">${tr("trash.none")}</p>
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.close")}</button>
        <button class="btn danger" id="trash-empty">${tr("trash.empty")}</button>
      </div>
    `);
    const listEl = m.body.querySelector("#trash-list");
    m.body.querySelector("[data-close]").onclick = m.close;

    const render = async () => {
      let data;
      try {
        data = await api("/api/trash");
      } catch (err) { toast(err.message); return; }
      const items = data.items || [];
      if (!items.length) {
        listEl.innerHTML = `<p class="muted">${tr("trash.none")}</p>`;
        m.body.querySelector("#trash-empty").disabled = true;
        return;
      }
      listEl.innerHTML = items.map((it) => `
        <div class="trash-row" data-id="${it.id}">
          <div class="trash-row-main">
            <span class="trash-title">${escHtml(short(it.title, 60))}</span>
            <span class="muted trash-date">${tr("trash.deletedAt", { date: fmtDate(it.deleted_at) })}</span>
          </div>
          <div class="trash-row-actions">
            <button class="btn" data-act="restore">${tr("trash.restore")}</button>
            <button class="btn danger" data-act="purge">${tr("trash.purge")}</button>
          </div>
        </div>
      `).join("");
      m.body.querySelector("#trash-empty").disabled = false;

      listEl.querySelectorAll("[data-act='restore']").forEach((btn) => {
        btn.onclick = async () => {
          const id = +btn.closest(".trash-row").dataset.id;
          try {
            await post(`/api/thoughts/${id}/restore`);
            toast(tr("trash.restoreDone"));
            await render();
            await refreshGraph();
          } catch (err) { toast(err.message); }
        };
      });
      listEl.querySelectorAll("[data-act='purge']").forEach((btn) => {
        btn.onclick = async () => {
          const row = btn.closest(".trash-row");
          const id = +row.dataset.id;
          const title = row.querySelector(".trash-title").textContent;
          if (!confirm(tr("trash.purgeConfirm", { title }))) return;
          try {
            await del(`/api/thoughts/${id}/purge`);
            toast(tr("trash.purgeDone"));
            await render();
          } catch (err) { toast(err.message); }
        };
      });
    };

    m.body.querySelector("#trash-empty").onclick = () => {
      const n = m.body.querySelectorAll(".trash-row").length;
      if (!n) return;
      confirmByTyping(tr("trash.purgeAllHint", { n, s: n === 1 ? "" : "s" }), String(n), async () => {
        try {
          await del("/api/trash");
          toast(tr("trash.emptyDone"));
          await render();
          await refreshGraph();
        } catch (err) { toast(err.message); }
      });
    };

    render();
  }

  function openBackupsModal() {
    const m = openModal(tr("backups.title"), `
      <div id="backups-list" class="backups-list">
        <p class="muted">${tr("backups.none")}</p>
      </div>
      <div class="form-actions">
        <button class="btn" data-close>${tr("btn.close")}</button>
        <button class="btn primary" id="backups-create">${tr("backups.create")}</button>
        <button class="btn" id="backups-create-all">${tr("backups.createAll")}</button>
      </div>
    `);
    const listEl = m.body.querySelector("#backups-list");
    m.body.querySelector("[data-close]").onclick = m.close;

    const render = async () => {
      let data;
      try {
        data = await api("/api/backups");
      } catch (err) { toast(err.message); return; }
      const items = data.items || [];
      if (!items.length) {
        listEl.innerHTML = `<p class="muted">${tr("backups.none")}</p>`;
        return;
      }
      listEl.innerHTML = items.map((b) => `
        <div class="backup-row" data-filename="${escAttr(b.filename)}" data-name="${escAttr(b.name)}">
          <div class="backup-row-main">
            <span class="backup-name">${escHtml(b.name)}</span>
            <span class="muted">${escHtml(b.filename)} · ${fmtSize(b.size_bytes)}</span>
          </div>
          <button class="btn" data-act="restore">${tr("backups.restore")}</button>
        </div>
      `).join("");

      listEl.querySelectorAll("[data-act='restore']").forEach((btn) => {
        btn.onclick = async () => {
          const row = btn.closest(".backup-row");
          const name = row.dataset.name;
          const filename = row.dataset.filename;
          if (!confirm(tr("backups.restoreConfirm", { filename }))) return;
          try {
            await post("/api/backups/restore", { name, filename });
            toast(tr("backups.restoreDone"));
            await refreshGraph();
            await loadSettings();
          } catch (err) { toast(err.message); }
        };
      });
    };

    m.body.querySelector("#backups-create").onclick = async () => {
      try {
        const data = await post("/api/backups");
        const created = (data.items || [])[0];
        if (created && created.verified === false) {
          toast(tr("backups.verifyWarning"));
        } else {
          toast(tr("backups.backedUp"));
        }
        await render();
      } catch (err) { toast(err.message); }
    };
    m.body.querySelector("#backups-create-all").onclick = async () => {
      try {
        const data = await post("/api/backups?scope=all");
        const created = data.items || [];
        const n = created.length;
        if (created.some((b) => b.verified === false)) {
          toast(tr("backups.verifyWarning"));
        } else {
          toast(tr("backups.backedUpAll", { n, s: n === 1 ? "" : "s" }));
        }
        await render();
      } catch (err) { toast(err.message); }
    };

    render();
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
  $("btn-suggest-parents").onclick = suggestParentsForSelected;
  $("btn-suggest-relations").onclick = suggestRelationsForSelected;

  $("btn-delete-thought").onclick = async () => {
    const t = state.selectedThought;
    if (!t) return;
    const hasChildren = t.children && t.children.length > 0;
    const msg = hasChildren
      ? tr("confirm.deleteCascade", { title: short(t.title) })
      : tr("confirm.delete", { title: short(t.title) });
    if (!confirm(msg)) return;
    try {
      await del("/api/thoughts/" + detailIdFor(t) + (hasChildren ? "?cascade=true" : ""));
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

  // ------------------------------------------------------------- graph theme
  let graphTheme = localStorage.getItem("kb-graph-theme") || "light";
  let themeAnim = null;
  const graphContainerEl = $("graph-container");
  const themeBtn = $("btn-theme");
  themeBtn.textContent = "◐ " + (graphTheme === "dark" ? tr("toolbar.themeDark") : tr("toolbar.themeLight"));

  function setGraphTheme(theme) {
    graphTheme = theme;
    try {
      localStorage.setItem("kb-graph-theme", theme);
      cy.style(theme === "dark" ? DARK_THEME_STYLE : LIGHT_THEME_STYLE);
      graphContainerEl.classList.toggle("theme-dark", theme === "dark");
      themeBtn.textContent = "◐ " + (theme === "dark" ? tr("toolbar.themeDark") : tr("toolbar.themeLight"));
      clearInterval(themeAnim);
      themeAnim = null;
      if (theme === "dark") {
        // Flowing edge dashes: shift a dashed overlay along each edge each tick.
        const edgeStyle = cy.style().selector("edge");
        edgeStyle.style("line-style", "dashed");
        edgeStyle.style("line-dash-pattern", [4, 8]);
        const tick = () => {
          const off = Math.floor(Date.now() / 90) % 12;
          edgeStyle.style("line-dash-offset", off);
        };
        tick();
        themeAnim = setInterval(tick, 90);
      } else {
        const edgeStyle = cy.style().selector("edge");
        edgeStyle.style("line-style", "solid");
        edgeStyle.style("line-dash-pattern", "none");
        edgeStyle.style("line-dash-offset", 0);
      }
    } catch (e) { /* theme styling is cosmetic — never let it freeze the app */ }
  }
  themeBtn.onclick = () => setGraphTheme(graphTheme === "dark" ? "light" : "dark");
  setGraphTheme(graphTheme);

  $("btn-view-graph").onclick = () => setView("graph");
  $("btn-view-outline").onclick = () => setView("outline");
  $("btn-view-timeline").onclick = () => setView("timeline");
  $("btn-view-review").onclick = () => setView("review");
  $("btn-select").onclick = toggleSelectMode;
  $("btn-detail-history").onclick = openVersionsModal;
  $("btn-bulk-delete").onclick = bulkDelete;
  $("btn-bulk-move").onclick = bulkMove;
  $("btn-bulk-export").onclick = bulkExport;
  $("btn-bulk-clear").onclick = bulkClear;
  $("btn-content-preview").onclick = () => setContentMode("preview");
  $("btn-content-source").onclick = () => setContentMode("source");
  $("btn-connections").onclick = findConnections;
  $("btn-translate-titles").onclick = translateTitles;
  $("btn-translate-content").onclick = translateContent;
  $("btn-comment-add").onclick = addComment;
  $("comment-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addComment();
  });

  $("btn-send").onclick = sendChat;
  ctxEnabled.addEventListener("change", updateSelectionUI);
  $("followups-enabled").addEventListener("change", async (e) => {
    try {
      await put("/api/settings", { auto_followups: e.target.checked ? "true" : "false" });
      state.settings.auto_followups = e.target.checked ? "true" : "false";
      loadFollowups();
    } catch (err) { alert(err.message); }
  });
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
    if (state.selectedThought) parentIds.push(detailIdFor(state.selectedThought));
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
      suggestLinksFor(created);
    } catch (err) { alert(err.message); }
  };

  $("btn-settings").onclick = settingsModal;
  $("btn-trash").onclick = openTrashModal;
  $("btn-backups").onclick = openBackupsModal;
  $("btn-shortcuts").onclick = openShortcutsModal;
  $("connect-dismiss").onclick = hideConnectBar;

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
  $("search-scope-all").addEventListener("change", () => {
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
  $("btn-reset-layout").onclick = () => {
    clearKbPositions(currentKbName());
    if (state.thoughts.length === 0) return;
    if (layoutSelect.value === "mindmap") recenterMindmap();
    else cy.layout(layoutOptions(layoutSelect.value)).run();
  };
  $("btn-kb-rename").onclick = async () => {
    const data = await loadKbList();
    const current = $("kb-select").value;
    kbNameModal(tr("kb.renameTitle"), current, tr("kb.rename"), async (newName) => {
      await post("/api/kbs/" + encodeURIComponent(current) + "/rename", { name: newName });
      const map = loadSavedPositions();
      if (map[current]) { map[newName] = map[current]; delete map[current]; persistSavedPositions(map); }
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
        clearKbPositions(current);
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
      downloadBlob(JSON.stringify(data, null, 2), "application/json", "brainforest-export.json");
      toast(tr("export.done"));
    } catch (err) { alert(err.message); }
  };
  $("btn-export-md").onclick = downloadKbMarkdown;
  $("btn-export-thought").onclick = () => {
    const t = state.selectedThought;
    if (t) downloadThought("md", detailIdFor(t), fmtTitle(t));
  };
  $("btn-export-thought-json").onclick = () => {
    const t = state.selectedThought;
    if (t) downloadThought("json", detailIdFor(t), fmtTitle(t));
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
      if (data && data.warnings && data.warnings.length) {
        toast(tr("import.mediaLimit"));
      }
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

  // ------------------------------------------------------------- minimap

  function drawMinimap() {
    if (!minimapEl || minimapEl.classList.contains("hidden")) return;
    const nodes = cy.nodes();
    if (nodes.length === 0) { minimapEl.innerHTML = ""; return; }
    const mw = minimapEl.clientWidth, mh = minimapEl.clientHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const nodePos = [];
    nodes.forEach((n) => {
      const p = n.position();
      nodePos.push(p);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
    const pad = 6;
    const scale = Math.min((mw - pad * 2) / bw, (mh - pad * 2) / bh);
    const ox = (mw - bw * scale) / 2 - minX * scale;
    const oy = (mh - bh * scale) / 2 - minY * scale;
    const px = (p) => pad + p.x * scale + ox;
    const py = (p) => pad + p.y * scale + oy;

    let s = '<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">';
    // parent → child links as lines between the node dots
    cy.edges().forEach((e) => {
      const sp = e.source().position(), tp = e.target().position();
      s += `<line class="mm-edge" x1="${px(sp)}" y1="${py(sp)}" x2="${px(tp)}" y2="${py(tp)}"/>`;
    });
    for (const p of nodePos) {
      s += `<circle class="mm-node" cx="${px(p)}" cy="${py(p)}" r="2"/>`;
    }
    // visible region → navigation rectangle
    const ext = cy.extent();
    const vx = px({ x: ext.x1, y: ext.y1 }), vy = py({ x: ext.x1, y: ext.y1 });
    const vw = Math.max(4, (ext.x2 - ext.x1) * scale), vh = Math.max(4, (ext.y2 - ext.y1) * scale);
    s += `<rect class="mm-viewport" x="${vx}" y="${vy}" width="${vw}" height="${vh}"/>`;
    s += "</svg>";
    minimapEl.innerHTML = s;
  }

  function panToModel(clientX, clientY) {
    const rect = minimapEl.getBoundingClientRect();
    const mw = rect.width, mh = rect.height;
    const nodes = cy.nodes();
    if (nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const p = n.position();
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
    const pad = 6;
    const scale = Math.min((mw - pad * 2) / bw, (mh - pad * 2) / bh);
    const ox = (mw - bw * scale) / 2 - minX * scale;
    const oy = (mh - bh * scale) / 2 - minY * scale;
    const mx = (clientX - rect.left - pad - ox) / scale;
    const my = (clientY - rect.top - pad - oy) / scale;
    const z = cy.zoom();
    cy.pan({ x: -mx * z + cy.width() / 2, y: -my * z + cy.height() / 2 });
  }

  function initMinimap() {
    if (!minimapEl) return;
    $("btn-minimap").addEventListener("click", () => {
      state.showMinimap = !state.showMinimap;
      $("btn-minimap").classList.toggle("active", state.showMinimap);
      minimapEl.classList.toggle("hidden", !state.showMinimap);
      if (state.showMinimap) drawMinimap();
    });
    let dirty = false, raf = null;
    cy.on("pan zoom render resize", () => {
      if (!state.showMinimap || minimapEl.classList.contains("hidden")) return;
      dirty = true;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = null;
        if (dirty) { dirty = false; drawMinimap(); }
      });
    });
    let dragging = false;
    minimapEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      minimapEl.setPointerCapture(e.pointerId);
      dragging = true;
      panToModel(e.clientX, e.clientY);
    });
    minimapEl.addEventListener("pointermove", (e) => {
      if (dragging) panToModel(e.clientX, e.clientY);
    });
    minimapEl.addEventListener("pointerup", () => { dragging = false; });
    minimapEl.addEventListener("pointercancel", () => { dragging = false; });
  }

  // ------------------------------------------------------------- init

  loadSettings().then(applyStaticTranslations);
  loadKbList();
  initFilters();
  initMoreMenu();
  initNodeMenu();
  initNav();
  initShortcuts();
  initResize();
  initChatMsgsResize();
  initMediaUI();
  initMinimap();
  refreshGraph().then(() => setView("outline"));
})();
