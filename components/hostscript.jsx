/* 
   hostscript.jsx — Add this function to your existing hostscript.jsx file
   
   This new function detects effects that reference missing plugins/effects
   that are not available in the current After Effects installation.
   
   Place this function after the existing findHiddenEffects() function 
   (around line 226 in your original file).
*/

function findMissingEffects(includeOpts) {
    var out = [];
    try {
        var scoped = getScopedComps(includeOpts.activeCompOnly);
        if (includeOpts.activeCompOnly && scoped.length === 0) {
            return JSON.stringify({ error: "No comp is currently active. Open a comp to search 'In this comp'." });
        }
        
        for (var s = 0; s < scoped.length; s++) {
            var i = scoped[s].index;
            var comp = scoped[s].comp;
            
            for (var j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                
                // Skip layers based on filter options
                if (!includeOpts.locked && layer.locked) continue;
                if (!includeOpts.guide && layer.guideLayer) continue;
                if (!includeOpts.matte && (layer.isTrackMatte || checkIsTrackMatte(layer, comp))) continue;
                
                var fxGroup = null;
                try { fxGroup = layer("Effects"); } catch (eFx) { fxGroup = null; }
                
                if (fxGroup) {
                    for (var k = 1; k <= fxGroup.numProperties; k++) {
                        var fx = fxGroup.property(k);
                        
                        // Check if the effect is missing by looking for the "missing plugin" indicator
                        // In After Effects, a missing effect typically has:
                        // 1. An unavailable or broken reference
                        // 2. Cannot access certain properties without error
                        
                        var isMissing = false;
                        var errorMsg = "";
                        
                        try {
                            // Try to access basic effect properties
                            // If the effect is missing, this may fail or return invalid data
                            var fxName = fx.name;
                            
                            // Check if the effect appears to be disabled due to missing plugin
                            // by attempting to access its parameters
                            if (fxGroup.numProperties > 0) {
                                try {
                                    var testProp = fx.propertyGroup();
                                    // If we can access the property group, check for common missing indicators
                                    if (fxName.indexOf("Effect") === -1 && fxName.indexOf("Error") === -1) {
                                        // This is a heuristic check — a real "missing" plugin in AE
                                        // typically displays with [effect name] in red or has issues accessing properties
                                        
                                        // Try to check if match name is empty or invalid (sign of corruption/missing)
                                        try {
                                            var matchName = fx.matchName;
                                            if (matchName === "" || matchName === null || matchName === undefined) {
                                                isMissing = true;
                                                errorMsg = "Invalid or empty match name";
                                            }
                                        } catch (e) {
                                            isMissing = true;
                                            errorMsg = "Cannot access match name: " + e.message;
                                        }
                                    }
                                } catch (e) {
                                    isMissing = true;
                                    errorMsg = "Cannot access effect properties: " + e.message;
                                }
                            }
                        } catch (e) {
                            isMissing = true;
                            errorMsg = e.message;
                        }
                        
                        if (isMissing) {
                            var status = layer.enabled ? "MISSING FX" : "ON HIDDEN";
                            if (layer.locked) status += " (LOCKED)";
                            if (layer.guideLayer) status += " (GUIDE)";
                            if (layer.isTrackMatte || checkIsTrackMatte(layer, comp)) status += " (MATTE)";
                            
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
    } catch (e) {
        return JSON.stringify({ error: "Error scanning for missing effects: " + e.toString() });
    }
    
    return JSON.stringify(out);
}

/* 
   ALTERNATIVE: Simpler version that just identifies effects that might be placeholders
   If the above version doesn't work well, try this simpler approach:
*/

function findMissingEffects_Simple(includeOpts) {
    var out = [];
    try {
        var scoped = getScopedComps(includeOpts.activeCompOnly);
        if (includeOpts.activeCompOnly && scoped.length === 0) {
            return JSON.stringify({ error: "No comp is currently active. Open a comp to search 'In this comp'." });
        }
        
        for (var s = 0; s < scoped.length; s++) {
            var i = scoped[s].index;
            var comp = scoped[s].comp;
            
            for (var j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                
                if (!includeOpts.locked && layer.locked) continue;
                if (!includeOpts.guide && layer.guideLayer) continue;
                if (!includeOpts.matte && (layer.isTrackMatte || checkIsTrackMatte(layer, comp))) continue;
                
                var fxGroup = null;
                try { fxGroup = layer("Effects"); } catch (eFx) { fxGroup = null; }
                
                if (fxGroup) {
                    for (var k = 1; k <= fxGroup.numProperties; k++) {
                        var fx = fxGroup.property(k);
                        var fxName = fx.name;
                        
                        // Check for common "missing plugin" naming patterns
                        // After Effects often names broken effects as "Error" or shows the plugin name in brackets
                        var isMissing = (
                            fxName.indexOf("[") > -1 && fxName.indexOf("]") > -1 ||  // [Bracketed names] indicate missing
                            fxName.toLowerCase().indexOf("error") > -1 ||             // Error in name
                            fxName.toLowerCase().indexOf("missing") > -1              // Missing in name
                        );
                        
                        if (isMissing) {
                            var status = "MISSING PLUGIN";
                            if (layer.locked) status += " (LOCKED)";
                            if (layer.guideLayer) status += " (GUIDE)";
                            if (layer.isTrackMatte || checkIsTrackMatte(layer, comp)) status += " (MATTE)";
                            
                            out.push({
                                compIndex: i,
                                layerIndex: j,
                                fxIndex: k,
                                label: comp.name + " > " + layer.name + " [" + j + "] > " + fxName + " [" + k + "]",
                                status: status
                            });
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
