// jsx/hostscript.jsx — Project Auditor's actual After Effects logic.
//
// This is the file the update-checker in js/main.js overwrites and reloads
// with $.evalFile() when a new version is published — so fixes/new checks
// added here ship without restarting After Effects.
//
// Each search function returns a JSON string of result rows shaped like:
//   { compIndex, layerIndex?, fxIndex?, label, status }
// Live object references can't cross from this engine into the panel's HTML/JS
// context, so rows carry index paths instead; navigateToItem/deleteSelected
// re-locate the real objects from those indices when called back into.

// Some ExtendScript engines (older AE versions) don't ship a native JSON
// object. Every function below depends on JSON.stringify/JSON.parse, so we
// polyfill it here if missing rather than letting every call site fail with
// a ReferenceError that the panel can't distinguish from "no results."
if (typeof JSON === "undefined") {
    JSON = {};
}
if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (value) {
        var type = typeof value;
        if (value === null) return "null";
        if (type === "number" || type === "boolean") return String(value);
        if (type === "string") {
            return '"' + value.replace(/\\/g, "\\\\")
                              .replace(/"/g, '\\"')
                              .replace(/\n/g, "\\n")
                              .replace(/\r/g, "\\r")
                              .replace(/\t/g, "\\t") + '"';
        }
        if (type === "object") {
            if (value instanceof Array) {
                var arrParts = [];
                for (var i = 0; i < value.length; i++) {
                    arrParts.push(JSON.stringify(value[i] === undefined ? null : value[i]));
                }
                return "[" + arrParts.join(",") + "]";
            }
            var objParts = [];
            for (var key in value) {
                if (value.hasOwnProperty && !value.hasOwnProperty(key)) continue;
                var v = value[key];
                if (typeof v === "function" || typeof v === "undefined") continue;
                objParts.push(JSON.stringify(key) + ":" + JSON.stringify(v));
            }
            return "{" + objParts.join(",") + "}";
        }
        return "null";
    };
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        // eval is safe enough here: this only ever parses JSON we generated
        // ourselves (panel -> evalScript args) inside the trusted ExtendScript engine.
        return eval("(" + text + ")");
    };
}

function checkIsTrackMatte(lyr, cp) {
    try {
        if (typeof lyr.hasTrackMatte !== "undefined" || typeof cp.layer(1).trackMatteLayer !== "undefined") {
            for (var m = 1; m <= cp.numLayers; m++) {
                var checkLyr = cp.layer(m);
                if (checkLyr.hasTrackMatte && checkLyr.trackMatteLayer === lyr) return true;
            }
        }
    } catch (e) {}

    try {
        if (lyr.index < cp.numLayers) {
            var nextLyr = cp.layer(lyr.index + 1);
            if (nextLyr.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) return true;
        }
    } catch (e) {}
    return false;
}

/* ---------------- Search ---------------- */

function findCompsWithSpaces() {
    var out = [];
    try {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name.indexOf(" ") !== -1) {
                out.push({ compIndex: i, label: item.name, status: "so pay" });
            }
        }
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
    return JSON.stringify(out);
}

function fixSpaces() {
    var targetComps = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && /\s/g.test(item.name)) targetComps.push(item);
    }
    var fixCount = 0;
    if (targetComps.length > 0) {
        app.beginUndoGroup("Fix Comp Spaces");
        for (var j = 0; j < targetComps.length; j++) {
            try {
                targetComps[j].name = targetComps[j].name.replace(/\s+/g, "_");
                fixCount++;
            } catch (err) {}
        }
        app.endUndoGroup();
    }
    return JSON.stringify({ fixCount: fixCount });
}

function findHiddenLayers(includeLocked) {
    var out = [];
    try {
        for (var i = 1; i <= app.project.numItems; i++) {
            var comp = app.project.item(i);
            if (comp instanceof CompItem) {
                for (var j = 1; j <= comp.numLayers; j++) {
                    var layer = comp.layer(j);
                    if (!layer.enabled && !layer.isTrackMatte && !checkIsTrackMatte(layer, comp)) {
                        if (!includeLocked && layer.locked) continue;
                        var status = layer.locked ? "HIDDEN (LOCKED)" : "HIDDEN";
                        if (layer.guideLayer) status += " (GUIDE)";
                        out.push({
                            compIndex: i,
                            layerIndex: j,
                            label: comp.name + " > " + layer.name + " [" + j + "]",
                            status: status
                        });
                    }
                }
            }
        }
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
    return JSON.stringify(out);
}

function findHiddenEffects(includeLocked) {
    var out = [];
    try {
        for (var i = 1; i <= app.project.numItems; i++) {
            var comp = app.project.item(i);
            if (comp instanceof CompItem) {
                for (var j = 1; j <= comp.numLayers; j++) {
                    var layer = comp.layer(j);
                    if (!includeLocked && layer.locked) continue;
                    var fxGroup = null;
                    try { fxGroup = layer("Effects"); } catch (eFx) { fxGroup = null; }
                    if (fxGroup) {
                        for (var k = 1; k <= fxGroup.numProperties; k++) {
                            var fx = fxGroup.property(k);
                            if (!fx.enabled) {
                                var status = layer.enabled ? "DISABLED FX" : "ON HIDDEN";
                                if (layer.locked) status += " (LOCKED)";
                                if (layer.guideLayer) status += " (GUIDE)";
                                out.push({
                                    compIndex: i,
                                    layerIndex: j,
                                    fxIndex: k,
                                    label: comp.name + " > " + layer.name + " [" + j + "] > " + fx.name + " [" + k + "]",
                                    status: status
                                });
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
    return JSON.stringify(out);
}

function searchEffectsByName(searchStr, includeLocked) {
    var out = [];
    var needle = String(searchStr).toLowerCase();
    try {
        for (var i = 1; i <= app.project.numItems; i++) {
            var comp = app.project.item(i);
            if (comp instanceof CompItem) {
                for (var j = 1; j <= comp.numLayers; j++) {
                    var layer = comp.layer(j);
                    if (!includeLocked && layer.locked) continue;
                    var fxGroup = null;
                    try { fxGroup = layer("Effects"); } catch (eFx) { fxGroup = null; }
                    if (fxGroup) {
                        for (var k = 1; k <= fxGroup.numProperties; k++) {
                            var fx = fxGroup.property(k);
                            if (fx.name.toLowerCase().indexOf(needle) !== -1) {
                                var status = layer.locked ? "FOUND (LOCKED)" : "FOUND";
                                if (layer.guideLayer) status += " (GUIDE)";
                                out.push({
                                    compIndex: i,
                                    layerIndex: j,
                                    fxIndex: k,
                                    label: comp.name + " > " + layer.name + " [" + j + "] > " + fx.name + " [" + k + "]",
                                    status: status
                                });
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
    return JSON.stringify(out);
}

/* ---------------- Navigation ---------------- */

function navigateToItem(mode, refJson) {
    try {
        var ref = JSON.parse(refJson);
        var comp = app.project.item(ref.compIndex);
        if (!(comp instanceof CompItem)) return "Comp no longer exists.";

        if (mode === "space") {
            comp.openInViewer();
            return "ok";
        }

        if (mode === "hiddenLayers") {
            var layer = comp.layer(ref.layerIndex);
            comp.openInViewer();
            for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            layer.selected = true;
            return "ok";
        }

        if (mode === "hiddenFX" || mode === "searchFX") {
            var fxLayer = comp.layer(ref.layerIndex);
            comp.openInViewer();
            for (var i2 = 1; i2 <= comp.numLayers; i2++) comp.layer(i2).selected = false;
            fxLayer.selected = true;
            try {
                var fxGroup = fxLayer("Effects");
                var fx = fxGroup.property(ref.fxIndex);
                fx.selected = true;
            } catch (e) {}
            return "ok";
        }

        return "Unknown mode.";
    } catch (err) {
        return "Could not navigate to item.\nIt may have been deleted or renamed.\n\nError: " + err.toString();
    }
}

/* ---------------- Deletion ---------------- */

function deleteSelected(mode, refsJson) {
    var refs = JSON.parse(refsJson);
    var deleted = 0;

    app.beginUndoGroup("Audit Delete Selected");
    try {
        if (mode === "hiddenLayers") {
            // Group by comp and sort layer indices descending so removing one
            // layer doesn't shift the index of another layer still queued for removal.
            var byComp = {};
            for (var r = 0; r < refs.length; r++) {
                var ref = refs[r];
                if (!byComp[ref.compIndex]) byComp[ref.compIndex] = [];
                byComp[ref.compIndex].push(ref.layerIndex);
            }
            for (var ci in byComp) {
                var comp = app.project.item(Number(ci));
                if (!(comp instanceof CompItem)) continue;
                var idxs = byComp[ci].sort(function (a, b) { return b - a; });
                for (var x = 0; x < idxs.length; x++) {
                    try {
                        var layer = comp.layer(idxs[x]);
                        if (layer.locked || checkIsTrackMatte(layer, comp)) continue;
                        layer.remove();
                        deleted++;
                    } catch (e) {}
                }
            }
        } else if (mode === "hiddenFX" || mode === "searchFX") {
            var byLayer = {};
            for (var r2 = 0; r2 < refs.length; r2++) {
                var ref2 = refs[r2];
                var key = ref2.compIndex + ":" + ref2.layerIndex;
                if (!byLayer[key]) byLayer[key] = [];
                byLayer[key].push(ref2.fxIndex);
            }
            for (var key2 in byLayer) {
                var parts = key2.split(":");
                var comp2 = app.project.item(Number(parts[0]));
                if (!(comp2 instanceof CompItem)) continue;
                var layer2 = comp2.layer(Number(parts[1]));
                if (layer2.locked) continue;
                var fxIdxs = byLayer[key2].sort(function (a, b) { return b - a; });
                var fxGroup2 = layer2("Effects");
                for (var y = 0; y < fxIdxs.length; y++) {
                    try {
                        fxGroup2.property(fxIdxs[y]).remove();
                        deleted++;
                    } catch (e) {}
                }
            }
        } else if (mode === "space") {
            for (var r3 = 0; r3 < refs.length; r3++) {
                try {
                    app.project.item(refs[r3].compIndex).remove();
                    deleted++;
                } catch (e) {}
            }
        }
    } finally {
        app.endUndoGroup();
    }
    return JSON.stringify({ deleted: deleted });
}

function deleteAllByMode(mode, includeLocked, searchStr) {
    // Note: locked layers/effects are never deleted here regardless of
    // includeLocked — that flag only controls what's shown in the list,
    // matching the original script's behavior.
    var deleted = 0;
    app.beginUndoGroup("Audit Delete All");
    try {
        if (mode === "hiddenLayers") {
            for (var a = 1; a <= app.project.numItems; a++) {
                var compL = app.project.item(a);
                if (compL instanceof CompItem) {
                    for (var b = compL.numLayers; b >= 1; b--) {
                        var lyr = compL.layer(b);
                        if (!lyr.enabled && !lyr.locked && !checkIsTrackMatte(lyr, compL)) {
                            lyr.remove();
                            deleted++;
                        }
                    }
                }
            }
        } else if (mode === "hiddenFX") {
            for (var c = 1; c <= app.project.numItems; c++) {
                var compF = app.project.item(c);
                if (compF instanceof CompItem) {
                    for (var d = 1; d <= compF.numLayers; d++) {
                        var lyrF = compF.layer(d);
                        if (lyrF.locked) continue;
                        var fxG = lyrF("Effects");
                        if (fxG) {
                            for (var e = fxG.numProperties; e >= 1; e--) {
                                if (!fxG.property(e).enabled) {
                                    fxG.property(e).remove();
                                    deleted++;
                                }
                            }
                        }
                    }
                }
            }
        } else if (mode === "searchFX") {
            var needle = String(searchStr).toLowerCase();
            if (needle !== "") {
                for (var f = 1; f <= app.project.numItems; f++) {
                    var compS = app.project.item(f);
                    if (compS instanceof CompItem) {
                        for (var g = 1; g <= compS.numLayers; g++) {
                            var lyrS = compS.layer(g);
                            if (lyrS.locked) continue;
                            var fxGS = lyrS("Effects");
                            if (fxGS) {
                                for (var h = fxGS.numProperties; h >= 1; h--) {
                                    if (fxGS.property(h).name.toLowerCase().indexOf(needle) !== -1) {
                                        fxGS.property(h).remove();
                                        deleted++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        // "space" mode intentionally has no Delete All behavior here —
        // the original script doesn't define one for that mode either.
    } finally {
        app.endUndoGroup();
    }
    return JSON.stringify({ deleted: deleted });
}
