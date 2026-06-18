(function(thisObj) {
    var lastSearchMode = ""; 

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", "Project Auditor v2.3", undefined, {resizeable: true});
        win.spacing = 10;
        win.margins = 15;

        // --- NHÓM 1: THANH TÌM KIẾM THEO TÊN ---
        var searchNameGroup = win.add("group");
        searchNameGroup.orientation = "row";
        searchNameGroup.alignment = ["fill", "top"]; 
        searchNameGroup.spacing = 8;

        var placeholderText = "Enter Effect Name...";
        var editSearch = searchNameGroup.add("edittext", undefined, placeholderText);
        editSearch.alignment = ["fill", "center"]; 
        editSearch.preferredSize.height = 25;

        var btnFindEffName = searchNameGroup.add("button", undefined, "Find Effect");
        btnFindEffName.preferredSize = [144, 25]; 
        btnFindEffName.alignment = ["right", "center"];

        editSearch.onActivate = function() { if (this.text === placeholderText) this.text = ""; };
        editSearch.onDeactivate = function() { if (this.text === "") this.text = placeholderText; };


        // --- NHÓM 2: DANH SÁCH KẾT QUẢ (CHUẨN 600PX) ---
        var mainGroup = win.add("group");
        mainGroup.orientation = "column";
        mainGroup.alignment = ["fill", "fill"];
        mainGroup.spacing = 5;

        var resList = mainGroup.add("listbox", undefined, [], {
            multiselect: true, 
            numberOfColumns: 2, 
            showHeaders: true, 
            columnTitles: ["Item Path [Index]", "Status"]
        });
        resList.alignment = ["fill", "fill"];
        resList.preferredSize = [600, 380]; 
        resList.columnWidths = [500, 75]; 

        // --- THANH THÔNG TIN & BỘ LỌC KHÓA ---
        var infoGroup = mainGroup.add("group");
        infoGroup.orientation = "row";
        infoGroup.alignment = ["fill", "top"];
        
        var lblCounter = infoGroup.add("statictext", undefined, "Total items: 0  |  Double-click to jump to item");
        lblCounter.preferredSize.width = 350; 
        lblCounter.alignment = ["left", "center"];
        
        var cbIncludeLocked = infoGroup.add("checkbox", undefined, "Include locked layers");
        cbIncludeLocked.alignment = ["right", "center"];
        cbIncludeLocked.value = true; 

        cbIncludeLocked.onClick = function() {
            if (lastSearchMode === "hiddenLayers") btnFindHidden.onClick();
            else if (lastSearchMode === "hiddenFX") btnFindEffects.onClick();
            else if (lastSearchMode === "searchFX") btnFindEffName.onClick();
            // "space" mode and empty mode are unaffected by the locked-layer filter
        };


        // --- NHÓM 3: CÁC NÚT TÌM KIẾM HỆ THỐNG ---
        var searchGroup = win.add("group");
        searchGroup.orientation = "row";
        searchGroup.alignment = ["fill", "top"]; 
        searchGroup.spacing = 8;

        var btnFindSpace = searchGroup.add("button", undefined, "Comps w/ Spaces");
        var btnFixSpace = searchGroup.add("button", undefined, "Fix Space -> _"); 
        var btnFindHidden = searchGroup.add("button", undefined, "Hidden Layers");
        var btnFindEffects = searchGroup.add("button", undefined, "Hidden Effects");
        
        btnFindSpace.preferredSize = [144, 26];
        btnFixSpace.preferredSize = [144, 26];
        btnFindHidden.preferredSize = [144, 26];
        btnFindEffects.preferredSize = [144, 26];


        // --- NHÓM 4: CÁC NÚT THAO TÁC / XÓA (KÍCH THƯỚC CHUẨN 194 x 30) ---
        var actionGroup = win.add("group");
        actionGroup.orientation = "row";
        actionGroup.alignment = ["fill", "top"]; 
        actionGroup.spacing = 9; 

        // NÚT "COPY NAMES"
        var btnCopyGroup = actionGroup.add("group", undefined);
        btnCopyGroup.minimumSize = [194, 30]; 
        btnCopyGroup.maximumSize = [194, 30]; 
        btnCopyGroup.alignChildren = ["center", "center"]; 
        btnCopyGroup.graphics.backgroundColor = btnCopyGroup.graphics.newBrush(btnCopyGroup.graphics.BrushType.SOLID_COLOR, [0.1, 0.45, 0.8, 1]); 

        var txtCopyText = btnCopyGroup.add("statictext", undefined, "Copy Names");
        txtCopyText.graphics.foregroundColor = txtCopyText.graphics.newPen(txtCopyText.graphics.PenType.SOLID_COLOR, [1, 1, 1, 1], 1); 

        // NÚT "DELETE SELECTED"
        var btnDelSel = actionGroup.add("group", undefined);
        btnDelSel.minimumSize = [194, 30]; 
        btnDelSel.maximumSize = [194, 30]; 
        btnDelSel.alignChildren = ["center", "center"];
        btnDelSel.graphics.backgroundColor = btnDelSel.graphics.newBrush(btnDelSel.graphics.BrushType.SOLID_COLOR, [0.85, 0.65, 0.1, 1]); 

        var txtDelSel = btnDelSel.add("statictext", undefined, "Delete Selected");
        txtDelSel.graphics.foregroundColor = txtDelSel.graphics.newPen(txtDelSel.graphics.PenType.SOLID_COLOR, [0, 0, 0, 1], 1); 

        // NÚT "DELETE ALL"
        var btnDelAll = actionGroup.add("group", undefined);
        btnDelAll.minimumSize = [194, 30]; 
        btnDelAll.maximumSize = [194, 30]; 
        btnDelAll.alignChildren = ["center", "center"];
        btnDelAll.graphics.backgroundColor = btnDelAll.graphics.newBrush(btnDelAll.graphics.BrushType.SOLID_COLOR, [0.75, 0.15, 0.15, 1]); 

        var txtDelAll = btnDelAll.add("statictext", undefined, "Delete All");
        txtDelAll.graphics.foregroundColor = txtDelAll.graphics.newPen(txtDelAll.graphics.PenType.SOLID_COLOR, [1, 1, 1, 1], 1); 


        // --- LOGIC FUNCTIONS ---
        var greetings = [
            "Xin chao! Chuc mot ngay lam viec vui ve ☀️",
            "Hom nay render nhanh, deadline xa — hoan hao! 🎬",
            "Ca phe da san sang? Bat dau thoi! ☕",
            "Moi layer deu on, moi thu deu dep. Tin tuong vao ban than! ✨",
            "Chao buoi sang! Hom nay audit se sach bong 🧹",
            "Khong co hidden layer nao thoat khoi tam mat ban! 🔍",
            "Project hom nay chac chan se xuat sac 🚀",
            "Bat dau mot ngay moi — khong co effect nao bi bo sot! 💪",
            "Lam viec cham chi, ve som, ngu ngon. Let's go! 🌟",
            "Moi frame deu quan trong. Ban dang lam tot lam! 🎞️",
            "Render xong roi, an mot mieng banh nao! 🍰",
            "Hom nay co the la ngay khong co bug. Cu hy vong! 🤞",
            "Project sach, tam tri sach, sang tao bay cao! 🧠",
            "Keyframe dung cho, deadline cung dung lo! ⏱️",
            "Mot ngay moi, mot co hoi de project hoan hao hon! 🌈",
            "Coffee + After Effects = cong thuc thanh cong ☕🎬",
            "Ban da kiem tra het roi, gio la luc nghi ngoi 5 phut 😌",
            "Khong co gi sai ca, chi la chua toi uc thoi 😄",
            "Chuc ban render nhanh, export gon, khach hang vui! 📦",
            "Hom nay la ngay tot de don dep project cu! 🗂️"
        ];

        function showGreeting() {
            resList.removeAll();
            var msg = greetings[Math.floor(Math.random() * greetings.length)];
            var item = resList.add("item", msg);
            item.subItems[0].text = "";
            item.objRef = null;
            lblCounter.text = "Total items: 0  |  Double-click to jump to item";
        }

        function addAuditItem(label, status, actualObj) {
            var item = resList.add("item", label);
            item.subItems[0].text = status;
            item.objRef = actualObj; 
        }

        function updateCounter() {
            var count = resList.items.length;
            if (count === 0) {
                showGreeting();
            } else {
                lblCounter.text = "Total items: " + count + "  |  Double-click to jump to item";
            }
        }

        function openCopyWindow(text) {
            var copyWin = new Window("dialog", "Hit Ctrl+C to Copy");
            copyWin.orientation = "column";
            copyWin.margins = 15;
            var et = copyWin.add("edittext", [0, 0, 450, 250], text, {multiline: true, scrolling: true});
            et.active = true; 
            copyWin.add("button", undefined, "Done", {name: "ok"});
            copyWin.show();
        }

        function checkIsTrackMatte(lyr, cp) {
            try {
                if (typeof lyr.hasTrackMatte !== "undefined" || typeof cp.layer(1).trackMatteLayer !== "undefined") {
                    for (var m = 1; m <= cp.numLayers; m++) {
                        var checkLyr = cp.layer(m);
                        if (checkLyr.hasTrackMatte && checkLyr.trackMatteLayer === lyr) return true;
                    }
                }
            } catch(e) {}
            try {
                if (lyr.index < cp.numLayers) {
                    var nextLyr = cp.layer(lyr.index + 1);
                    if (nextLyr.trackMatteType !== TrackMatteType.NO_TRACK_MATTE) return true; 
                }
            } catch(e) {}
            return false;
        }

        // Show greeting on startup
        showGreeting();

        // --- DOUBLE-CLICK: JUMP TO ITEM IN COMPOSITION ---
        resList.onDoubleClick = function() {
            if (!resList.selection || resList.selection.length === 0) return;

            var clickedItem = resList.selection[0];
            if (!clickedItem || !clickedItem.objRef) return;

            var obj = clickedItem.objRef;
            if (!obj) return; // greeting item, do nothing

            try {
                // MODE: Comp with spaces — open the comp in viewer
                if (lastSearchMode === "space") {
                    var comp = obj; // objRef is the CompItem itself
                    var viewer = app.activeViewer;
                    comp.openInViewer();
                    return;
                }

                // MODE: Hidden layers — jump to comp, select the layer
                if (lastSearchMode === "hiddenLayers") {
                    var layer = obj; // objRef is the Layer
                    var comp = layer.containingComp;

                    // Open comp in viewer
                    comp.openInViewer();

                    // Deselect all, then select target layer
                    comp.layer(1); // access to ensure comp is active
                    for (var i = 1; i <= comp.numLayers; i++) {
                        comp.layer(i).selected = false;
                    }
                    layer.selected = true;
                    return;
                }

                // MODE: Hidden effects or search effects — jump to comp, select layer, reveal effect
                if (lastSearchMode === "hiddenFX" || lastSearchMode === "searchFX") {
                    var fx = obj; // objRef is the PropertyGroup (effect)

                    // Walk up the property chain to get the layer and comp
                    var parentLayer = null;
                    try {
                        // fx -> Effects group -> Layer
                        parentLayer = fx.parentProperty.parentProperty;
                    } catch(e) {}

                    if (!parentLayer) return;

                    var comp = parentLayer.containingComp;

                    // Open comp in viewer
                    comp.openInViewer();

                    // Deselect all layers, select the parent layer
                    for (var i = 1; i <= comp.numLayers; i++) {
                        comp.layer(i).selected = false;
                    }
                    parentLayer.selected = true;

                    // Open Effect Controls for the layer to make the effect visible
                    // AE doesn't have a direct API to scroll to/highlight an effect,
                    // but opening Effect Controls with the layer selected is the closest we can get.
                    // We can also select the effect property to highlight it.
                    try {
                        fx.selected = true;
                    } catch(e) {}

                    return;
                }

            } catch (err) {
                alert("Could not navigate to item.\nIt may have been deleted or renamed.\n\nError: " + err.toString());
            }
        };


        // --- SEARCH LOGIC ---
        btnFindSpace.onClick = function() {
            lastSearchMode = "space";
            resList.removeAll();
            for (var i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (item instanceof CompItem && item.name.indexOf(" ") !== -1) {
                    addAuditItem(item.name, "SPACE NAME", item);
                }
            }
            updateCounter();
        };

        btnFixSpace.onClick = function() {
            var targetComps = [];
            for (var i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (item instanceof CompItem && /\s/g.test(item.name)) targetComps.push(item);
            }
            if (targetComps.length === 0) return;

            app.beginUndoGroup("Fix Comp Spaces");
            var fixCount = 0;
            for (var j = 0; j < targetComps.length; j++) {
                try {
                    targetComps[j].name = targetComps[j].name.replace(/\s+/g, "_");
                    fixCount++;
                } catch (err) {}
            }
            app.endUndoGroup();
            
            btnFindSpace.onClick(); 
            alert("Successfully fixed " + fixCount + " names.");
        };

        btnFindHidden.onClick = function() {
            lastSearchMode = "hiddenLayers";
            resList.removeAll();
            for (var i = 1; i <= app.project.numItems; i++) {
                var comp = app.project.item(i);
                if (comp instanceof CompItem) {
                    for (var j = 1; j <= comp.numLayers; j++) {
                        var layer = comp.layer(j);
                        if (!layer.enabled && !layer.isTrackMatte && !checkIsTrackMatte(layer, comp)) {
                            if (!cbIncludeLocked.value && layer.locked) continue;

                            var status = layer.locked ? "HIDDEN (LOCKED)" : "HIDDEN";
                            if (layer.guideLayer) status += " (GUIDE)";
                            addAuditItem(comp.name + " > " + layer.name + " [" + j + "]", status, layer);
                        }
                    }
                }
            }
            updateCounter();
        };

        btnFindEffects.onClick = function() {
            lastSearchMode = "hiddenFX";
            resList.removeAll();
            for (var i = 1; i <= app.project.numItems; i++) {
                var comp = app.project.item(i);
                if (comp instanceof CompItem) {
                    for (var j = 1; j <= comp.numLayers; j++) {
                        var layer = comp.layer(j);
                        if (!cbIncludeLocked.value && layer.locked) continue;

                        var fxGroup = layer("Effects");
                        if (fxGroup) {
                            for (var k = 1; k <= fxGroup.numProperties; k++) {
                                var fx = fxGroup.property(k);
                                if (!fx.enabled) {
                                    var label = comp.name + " > " + layer.name + " [" + j + "] > " + fx.name + " [" + k + "]";
                                    var status = layer.enabled ? "DISABLED FX" : "⚠️ ON HIDDEN";
                                    if (layer.locked) status += " (LOCKED)";
                                    if (layer.guideLayer) status += " (GUIDE)";
                                    addAuditItem(label, status, fx);
                                }
                            }
                        }
                    }
                }
            }
            updateCounter();
        };

        btnFindEffName.onClick = function() {
            lastSearchMode = "searchFX";
            var searchStr = editSearch.text.toLowerCase();
            if (searchStr === "" || searchStr === placeholderText.toLowerCase()) return;
            resList.removeAll();
            for (var i = 1; i <= app.project.numItems; i++) {
                var comp = app.project.item(i);
                if (comp instanceof CompItem) {
                    for (var j = 1; j <= comp.numLayers; j++) {
                        var layer = comp.layer(j);
                        if (!cbIncludeLocked.value && layer.locked) continue;

                        var fxGroup = layer("Effects");
                        if (fxGroup) {
                            for (var k = 1; k <= fxGroup.numProperties; k++) {
                                var fx = fxGroup.property(k);
                                if (fx.name.toLowerCase().indexOf(searchStr) !== -1) {
                                    var label = comp.name + " > " + layer.name + " [" + j + "] > " + fx.name + " [" + k + "]";
                                    var status = layer.locked ? "FOUND (LOCKED)" : "FOUND";
                                    if (layer.guideLayer) status += " (GUIDE)";
                                    addAuditItem(label, status, fx);
                                }
                            }
                        }
                    }
                }
            }
            updateCounter();
        };

        // --- HÀM XÓA THÔNG MINH ---
        function runSmartDelete(uiItems, isDeleteAll) {
            if (!isDeleteAll && uiItems.length === 0) return;

            if (isDeleteAll) {
                app.beginUndoGroup("Audit Delete All");
                
                if (lastSearchMode === "hiddenLayers") {
                    for (var a = 1; a <= app.project.numItems; a++) {
                        var compL = app.project.item(a);
                        if (compL instanceof CompItem) {
                            for (var b = compL.numLayers; b >= 1; b--) {
                                var lyr = compL.layer(b);
                                if (!lyr.enabled && !lyr.locked && !checkIsTrackMatte(lyr, compL)) {
                                    lyr.remove();
                                }
                            }
                        }
                    }
                } 
                else if (lastSearchMode === "hiddenFX") {
                    for (var c = 1; c <= app.project.numItems; c++) {
                        var compF = app.project.item(c);
                        if (compF instanceof CompItem) {
                            for (var d = 1; d <= compF.numLayers; d++) {
                                var lyrF = compF.layer(d);
                                if (lyrF.locked) continue; 
                                var fxG = lyrF("Effects");
                                if (fxG) {
                                    for (var e = fxG.numProperties; e >= 1; e--) {
                                        if (!fxG.property(e).enabled) fxG.property(e).remove();
                                    }
                                }
                            }
                        }
                    }
                } 
                else if (lastSearchMode === "searchFX") {
                    var searchStr = editSearch.text.toLowerCase();
                    if (searchStr !== "" && searchStr !== placeholderText.toLowerCase()) {
                        for (var f = 1; f <= app.project.numItems; f++) {
                            var compS = app.project.item(f);
                            if (compS instanceof CompItem) {
                                for (var g = 1; g <= compS.numLayers; g++) {
                                    var lyrS = compS.layer(g);
                                    if (lyrS.locked) continue; 
                                    var fxGS = lyrS("Effects");
                                    if (fxGS) {
                                        for (var h = fxGS.numProperties; h >= 1; h--) {
                                            if (fxGS.property(h).name.toLowerCase().indexOf(searchStr) !== -1) {
                                                fxGS.property(h).remove();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                app.endUndoGroup();
            } 
            else {
                // CHẾ ĐỘ DELETE SELECTED
                app.beginUndoGroup("Audit Delete Selected");
                for (var j = uiItems.length - 1; j >= 0; j--) {
                    try {
                        var element = uiItems[j].objRef;
                        if (!element) continue;

                        if (lastSearchMode === "hiddenLayers") {
                            if (element.locked || checkIsTrackMatte(element, element.containingComp)) continue; 
                            element.remove();
                        } 
                        else if (lastSearchMode === "hiddenFX" || lastSearchMode === "searchFX") {
                            var pLayer = element.parentProperty ? element.parentProperty.parentProperty : null;
                            if (pLayer && pLayer.locked) continue; 
                            element.remove();
                        } 
                        else {
                            element.remove();
                        }
                    } catch (err) {}
                }
                app.endUndoGroup();
            }

            // Làm mới giao diện và đếm lại số lượng sau khi xóa
            if (lastSearchMode === "space") btnFindSpace.onClick();
            else if (lastSearchMode === "hiddenLayers") btnFindHidden.onClick();
            else if (lastSearchMode === "hiddenFX") btnFindEffects.onClick();
            else if (lastSearchMode === "searchFX") btnFindEffName.onClick();
            else {
                resList.removeAll();
                updateCounter();
            }
        }

        // --- HỆ THỐNG EVENT LISTENERS ---
        btnCopyGroup.addEventListener("mousedown", doCopyText, false);
        function doCopyText() {
            if (!resList.selection || resList.selection.length === 0) return;
            var cleanedList = [];
            for (var i = 0; i < resList.selection.length; i++) {
                cleanedList.push(resList.selection[i].text);
            }
            openCopyWindow(cleanedList.join("\r\n"));
        }

        btnDelSel.addEventListener("mousedown", doDelSel, false);
        function doDelSel() {
            if (!resList.selection) return;
            var sel = [];
            for(var i=0; i<resList.selection.length; i++) sel.push(resList.selection[i]);
            runSmartDelete(sel, false); 
        }

        btnDelAll.addEventListener("mousedown", doDelAll, false);
        function doDelAll() {
            var all = [];
            for (var i = 0; i < resList.items.length; i++) all.push(resList.items[i]);
            runSmartDelete(all, true); 
        }

        if (win instanceof Window) win.show();
        else win.layout.layout(true);
    }

    buildUI(thisObj);
})(this);