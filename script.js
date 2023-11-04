// CONSTANTS
const TRIGGERDIST = 0.00038;
const OBJECTDIST = 0.0003;
const MINMOVEDIST = 0.00005;
const BRISBANE = [-27.471709368260292, 153.02427458258452];

var mymap, markerLayer, mymarker, loopID, watchID;
var mycoords, timeHours, myDate;
var touchData = {
    initial: [0,0],
    previous: [0,0],
    updated: [0,0]
};

var pins = {};
var markers = {};
var items = {};
var popups = {};
var entities = {};

var screams;
var pinlist;

var playerData;
var activeDialogue;
var geocodingInProgress;

var godmode = location.search=="?godmode";
var arrowcontrols = location.search=="?arrowcontrols"
var playtest = location.search=="?playtest";
var pageReady = false;
var touchSensitive = "ontouchstart" in document.documentElement;


// PAGE EVENT HANDLERS 

$(document).ready(function(){
    initMap();
    
    loadSound();
    loadStories();
    
    // NAVIGATION MODE. If game is set to be GPS controlled (default), this starts watching player position. If in god mode, moveUser is fired on keypress instead, and there is no need for watchPosition to run.
    if(godmode || playtest) {
        $("#desktop-instructions").removeClass("invisible");
        $("#playother").text("GPS");
        $("#playlink").attr("href", "/spectralcarta/");
        followUser({
            "coords": {
                "latitude": BRISBANE[0],
                "longitude": BRISBANE[1]
            }
        });
    }
    else {
        $("#mobile-instructions").removeClass("invisible");
        if(arrowcontrols) navigator.geolocation.getCurrentPosition(followUser, function(){}, geoOptions);
        else watchID = navigator.geolocation.watchPosition(followUser, function(){}, geoOptions);
    }
    setWindowEvents();
});


function setWindowEvents() {

    $(window).blur(function() {
        screams.pause();
    });
    
    $(window).focus(function() {
        screams.play();
    });
    
    $(window).keypress(function(e) {
        if(!godmode && !arrowcontrols && !playtest) return false;
        if(e.key == "w" || e.which == 119) { // W
            moveUser(0.0001, 0);
        } else if(e.key == "a" || e.which == 97) {
            moveUser(0, -0.0001);
        } else if(e.key == "s" || e.which == 115) {
            moveUser(-0.0001, 0);
        } else if(e.key == "d" || e.which == 100) {
            moveUser(0, 0.0001);
        }
    });
    
    $(window).click(function(){
        if(pageReady) saveInLocalStorage();
    })
}

// LOOP FUNCTION: executed every minute

function loop() { // updates marker list every minute including 0s. Ensures that time of day related changes are executed, and redraws characters and items.
        $("#mymap").removeClass();
        
        timeHours = getHour();
        
        if(timeHours <= 6 || timeHours >= 18) {
            $("#mymap").addClass("night");
        } else {
            $("#mymap").addClass("day");
        }
        
        loadCharacters(pinlist);
}


// LEAFLET OBJECTS

pins.Ghost = L.icon({
    iconUrl: 'assets/ghostpin.png',
    iconSize: [50, 68],
    iconAnchor: [25, 68],
    popupAnchor: [0, -68]
});

pins.Person = L.icon({
    iconUrl: 'assets/personpin.png',
    iconSize: [25, 34],
    iconAnchor: [12, 34],
    popupAnchor: [0, -34]
});

pins.InterestPoint = L.icon({
    iconUrl: 'assets/interestpoint.png',
    iconSize: [50, 68],
    iconAnchor: [25, 68],
    popupAnchor: [0, -68]
});

var geoOptions = {
  enableHighAccuracy: true
};


// SAVE GAME

function toggleSaveMenu() {
    $("#save-panel").toggleClass("invisible");
}

function saveInLocalStorage() {
    localStorage.brisbaneGhost_playerData = JSON.stringify(playerData);
}

function saveJSON() {
    var saveData = JSON.stringify(playerData);
    var file = new Blob([saveData], {type: "text/plain"});
    if (window.navigator.msSaveOrOpenBlob) window.navigator.msSaveOrOpenBlob(file, "brisbaneGhost_playerData.txt");
    else {
        var a = document.createElement("a"), url = URL.createObjectURL(file);
        a.href = url;
        a.download =  "brisbaneGhost_playerData.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    toggleSaveMenu();
}

function loadSaveFile(e) {
    const file = e.target.files[0];
    if (file.type && file.type.indexOf('text') !== -1) {
        const reader=new FileReader(); 
        reader.onload=function(ev){ 
            localStorage.brisbaneGhost_playerData = ev.target.result;
            playerData = JSON.parse(ev.target.result);
            toggleSaveMenu();
        }
        reader.readAsText(file);
    }
}


// RESET

function toggleReset() {
    $("#save-panel").toggleClass("invisible");
    $("#reset-panel").toggleClass("invisible");
}

function resetForReal() {
    
    localStorage.removeItem("brisbaneGhost_playerData");
    
    location.reload();
}


// GAME FUNCTIONS

function initValues() { // Sets all dynamic values (values EXPECTED to change during gameplay) to their initial state. Used for reset
    playerData = {
        "switches": {},
        "inventory": {},
        "returnedInventory": {},
        "journal": {},
        "journalUnread": 0,
        "letters": {}
    };
    
    activeDialogue = {
        "lines": [],
        "index": -1,
        "name": undefined,
        "branchIndex": undefined
    };
    
    mycoords = [0, 0];
    timeHours = 0;
    geocodingInProgress = false;
}

function initMap() { // All page load functions. This fires irrespective of what mode you're in. So it doesn't scroll the map or update player position yet--places the player pin at 0,0 on the world map.
    initValues();
    
    mymap = L.map('mymap', {tapTolerance: 0, dragging: true, zoomControl: false})
    
    if(touchSensitive) {
        mymap.options.dragging = false;
        $("#mymap").on("touchstart", function(e){
            touchData.initial = touchData.previous = touchData.updated = [e.originalEvent.targetTouches[0].clientX, e.originalEvent.targetTouches[0].clientY];
        });
        
        $("#mymap").on("touchmove", function(e){
            touchData.updated = [e.originalEvent.targetTouches[0].clientX, e.originalEvent.targetTouches[0].clientY];
            mymap.panBy(
                [(touchData.previous[0]-touchData.updated[0]) * 1, (touchData.previous[1]-touchData.updated[1]) * 1],
                {animate: false}
            );
            touchData.previous = touchData.updated;
        });
        
         $("mymap").on("touchend", function(e){
            touchData.initial = [0,0];
            touchData.updated = [0,0];
            touchData.clicking = false;
         });
    }
    
    mymap.on("click", function(e) {
        if(getDist(touchData.initial, touchData.updated) < 10 && godmode) {
            followUser({
                "coords": {
                    "latitude": e.latlng.lat,
                    "longitude": e.latlng.lng
                }
            });
        }
    });
        
    
    mymarker = L.marker([0,0], {icon: pins.Person}).addTo(mymap);
    popups.yourehere = L.popup({closeButton: false});
    mymarker.bindPopup(popups.yourehere);
    mymarker._phrases = ["You might be here.", "You are probably here.", "Are you here?", "I think you are here."]
    mymarker.on("click", function() {
        this.openPopup();
        this._popup.setContent(selectRandom(this._phrases));
    });
    markerLayer = L.layerGroup().addTo(mymap);
   
   L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a></strong>',
        maxZoom: 19,
        id: 'circlejourney/ck7mlg1hj03q11iqm53k0lph9',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: "pk.eyJ1IjoiY2lyY2xlam91cm5leSIsImEiOiJjampoNXdwMXc0enNpM3FyNXZ2cXBuOGZnIn0.HWJyJUmJCi5ReC0_bNDHDw"
    }).addTo(mymap);
    
    mymap.setZoom(18);
        
    if(localStorage.noteSeen === undefined) toggleNotes();
                
    loop();
    
    loopID = setInterval(function(){ loop() }, 600000);
}

function followUser(position) { // Runs every time a change in user position is detected by geolocation service. Takes a coords object, with properties lat and lng representing latitude and longitude of the target position. This format is irregular.
    if(getDist(mycoords, [position.coords.latitude, position.coords.longitude]) > MINMOVEDIST) {
        mycoords = [position.coords.latitude, position.coords.longitude];
        if(mymarker._latlng.lat == 0 && mymarker._latlng.lat == 0) {
            mymap.panTo(mycoords);
        }
        mymarker.setLatLng(mycoords);
        paintCharacterMarkers();
        paintItemMarkers();
        
        compassToClosestGhost();
    }
}

function moveUser(dlat, dlng) { // Essentially the same as followUser, except it incrementally changes the position with WASD in arrow controls mode 
    
    mycoords = [mycoords[0]+dlat, mycoords[1]+dlng];
    
    mymarker.setLatLng(mycoords);
    paintCharacterMarkers();
    paintItemMarkers();
    compassToClosestGhost();
}

function panToMe() {
    mymap.panTo(mymarker._latlng);
}

function zoom(delta) {
    mymap.zoomIn(delta);
}



// Loading story entities with AJAX requests

function geoCode(latlng) {
    geocodingInProgress = true;
    var latformat = latlng[0].toFixed(8);
    var lonformat = latlng[1].toFixed(8);
    var query = latformat+","+lonformat;
    $.get("https://api.opencagedata.com/geocode/v1/json", {
        "key": "2f59e6f871084f919b396a09b0cd3af3",
        "q": query
    }, function(data) {
        $("#info").text(data.results[0].formatted);
    })
    .done(function() {
        geocodingInProgress = false;
    });
}

function loadStories() {
    $.getJSON("/degree/stories/stories.json?"+Math.random(), function(data){
        pinlist = data;
        loadCharacters(data);
    });
}


function loadCharacters(chars) {
    $.each(chars, function(i, val){
        var filename = val.replace(/\s/g,"")
        $.getJSON("/degree/stories/"+filename+".json?"+Math.random(), function(data){
            entities[val] = data;
            generateMarkers();
       });
    });
}


function generateMarkers() { //  This code generates markers visually, and refreshes journal, letters and inventory. It runs each time a character or item JSON request completes, but only goes through the code block if the entity list (characters & items) is fully loaded.

    if(Object.keys(entities).length == pinlist.length) { // check if entity list is fully loaded
        
        let hasSave = generatePlayerData();
        
        if(!hasSave) { // runs if the player is starting a new game.
            
            let insert = "A hasty primer: our Spectral Carta is an app that runs on your mobile phone. It follows your movements and reveals the ghosts and objects that you may pass. We operate mostly under cover, so you are advised to keep a low profile wherever you may investigate. Do also mind your safety and health by looking both ways before crossing roads, and bringing water with you when you travel long distances. It can be easy to get lost in the world of spirits, so much that you lose track of reality. As a member of the Guild of Mediums, your goal is to help ghosts, not to become one!";
            
            if(playtest || arrowcontrols) insert = "You have been assigned to our remote division <s>as per social distancing requirements</s>, and can conduct investigations at a distance via our desktop edition of the Spectral Carta. Simply use the WASD keys on your keyboard to navigate, and the Carta will reveal the ghosts and objects that you may pass.";
            
            sendLetter("Office1", "Office of Mediums", "Welcome!", "<p>Welcome, recruit, to Brisbane's Guild of Mediums! Our organisation was established in 2019 and we have been working overtime to deal with Brisbane's...ghost problem. It usually takes three hundred years for most cities to realise their need to do so, so we're proud to say that Brisbane is ahead of the curve.</p><p>"+insert+"</p><p>Safe exploring and good luck!</p><p>Yours Truly,<br>A.</p>");
            
            sendLetter("Office2", "Office of Mediums", "Oops forgot to mention something", "<p>By the way, we forgot to mention this in our last letter. If you lose sight of your location, you can tap the compass to bring yourself back into view. We hope you have found our Spectral Carta easy to use thus far! It is a work in progress.</p><p>Yours Forgetfully,<br>A.</p>");
            
            sendLetter("Office3", "Office of Mediums", "Your first assignment", "<p>Your first assignment as a member of our board has arrived!</p><p>A ghost has been reportedly sighted <a href='#' onclick=\"(function() {scrollToGhost(); toggleLetters();})();\">near the Queen Street bus station</a>. Members of the public claim it was wandering about and muttering as if searching for something on the ground.</p><p>Please make your way there to investigate. Should you find difficulty locating it, check your medium's compass: it always points to the nearest ghost.</p><p>Yours Truly,<br>A.</p>");
            toggleLetters();
        }
        
        $.each(entities, function(i, val){
            let newLatLng = {
                "lat": val.coords[0],
                "lng": val.coords[1]
            }
            
            if((val.type == "character" || val.type =="pointofinterest") && markers[val.name] === undefined) {
                var thisIcon;
                
                if(!playerData.switches[val.name].goodbye && val.type == "character") {
                    thisIcon = pins.Ghost;
                } else {
                    thisIcon = pins.InterestPoint;
                }
                
                markers[val.name] = L.marker(newLatLng, {icon: thisIcon})
                    .on('click', function() {
                        let storyContinue = triggerStory(this);
                        if(!storyContinue && this.options.opacity > 0.1) {
                            mymap.openPopup(popups[this._name]);
                        }
                    })
                    .addTo(mymap);
                markers[val.name]._name = val.name;
                markers[val.name]._timerange = val.time;
                if(val.sprites !== undefined) markers[val.name]._sprites = val.sprites;
                markers[val.name]._backgrounds = val.backgrounds;
                
                if(!godmode) markers[val.name].setOpacity(0);
                else markers[val.name].setOpacity(0.4)
                
                popups[val.name] = L.popup({offset: [0, -60], closeButton: false, autoPan: false})
                    .setContent(val.dialogueLabel)
                    .setLatLng([val.coords[0], val.coords[1]])
                    .addTo(mymap);
                mymap.closePopup(popups[val.name]);
                
            } else if(val.type == "item" && items[val.name] === undefined) {
                pins[val.name] = L.icon({
                    iconUrl: val.pin,
                    iconSize: [50, 68],
                    iconAnchor: [25, 68],
                    popupAnchor: [0, -68]
                });
    
                items[val.name] = L.marker(newLatLng, {icon: pins[val.name]})
                    .on('click', function() {
                        triggerItemStory(this);
                    })
                    .addTo(mymap);
                items[val.name]._name = val.name;
                items[val.name]._sprite = val.sprite;
                items[val.name]._pin = val.pin;
                items[val.name]._deleted = false;
                if(playerData.inventory[val.name] || playerData.returnedInventory[val.name]) {
                    items[val.name]._deleted = true;
                }
                if(!godmode) items[val.name].setOpacity(0);
                else items[val.name].setOpacity(0.4);
                
                popups[val.name] = L.popup({offset: [0, -60], closeButton: false, autoPan: false})
                    .setLatLng([val.coords[0], val.coords[1]])
                    .addTo(mymap);
                mymap.closePopup(popups[val.name]);
            }
        });
        
        refreshJournal();
        refreshInventory();
        refreshLetters();
        
        paintCharacterMarkers();
        paintItemMarkers();
        
        compassToClosestGhost();
        pageReady = true;
    }
}

        
function generatePlayerData() { // checks if save stored, otherwise generates blank
    if(localStorage.brisbaneGhost_playerData !== undefined){ // If player has played before
        playerData = JSON.parse(localStorage.brisbaneGhost_playerData);
        return playerData;
    } else {
        $.each(entities, function(key, val) {
            if(playerData.switches[key] === undefined) playerData.switches[key] = {};
        });
        $("#note").removeClass("invisible");
        return false;
    }
}


function paintCharacterMarkers() { // Called every time addCharacterMarkers() completes, i.e. once per loop. Also called every time a visual change occurs. Redaws the character markers. Opacity determines if you can interact with the ghost.
    var newVol = 0;
    $.each(markers, function(key, val) {
        var dist = getDist([val._latlng.lat, val._latlng.lng], mycoords);

        //as you walk away from a marker, it starts to fade. At the trigger distance, the opacity is 1. From the trigger distance to double the trigger distance, it decreases linearly to 0.
        
        var myTime = val._timerange;
        var newopacity = 0;
        
        // forces ghost to be invisible if the current time doesn't fall within its time range, and marks them as not awake.
        if(timeHours >= myTime[0] && timeHours < myTime[1] || timeHours+24 < myTime[1]) {
            newopacity = clamp(1-((dist-TRIGGERDIST*2)/TRIGGERDIST*2), 0, 1);
            val._awake = true;
        } else {
            newopacity = 0;
            val._awake = false;
        }
        
        if(!godmode) val.setOpacity(newopacity);
        else val.setOpacity(0.4+newopacity*0.6);
            
        if(newopacity >= newVol) newVol = newopacity;
        
        if(playerData.switches[val._name].goodbye) {
            val.setIcon(pins.InterestPoint);
            popups[val._name]._content = "Gone";
        }
        //else if(val.icon != pins.Ghost) val.setIcon(pins.Ghost);
    });
    screams.volume = newVol;
}


function paintItemMarkers() { // Runs when addItemMarkers() completes, i.e. once a loop
    for(var key in items) {
        var newopacity = 0;
        
        if(items[key]._deleted) {
            newopacity = 0;
        } else {
            var dist = getDist([items[key]._latlng.lat, items[key]._latlng.lng], mycoords);
    
            //as you walk away from a marker, it starts to fade. At the trigger distance, the opacity is 1. From the trigger distance to double the trigger distance, it decreases linearly to 0.
            
            newopacity = clamp(1-((dist-OBJECTDIST)/OBJECTDIST), 0, 1);
        }
        
        if(!godmode) items[key].setOpacity(newopacity);
        else items[key].setOpacity(0.4+0.6*newopacity);
    }
}


// SCROLL TO GHOST

function scrollToGhost(ghost="Pedestrian") {
    if(ghost == "Pedestrian") mymap.panTo({lat:-27.46980417761091, lng: 153.0251302856892});
    else mymap.panTo(markers[ghost]._latlng);
}


// STORY MECHANICS

function ghostClicked(marker) { // uses opacity as an indicator of distance.
    if(marker.options.opacity == 1) {
    } else if(marker.options.opacity > 0.1) {
        mymap.openPopup(popups[marker._name]);
    }
}


function closeOverlay() {
    if(activeDialogue.name !== undefined) {
        playerData.switches[activeDialogue.name].override = "";
        activeDialogue.index = -1;
        activeDialogue.lines = {};
        activeDialogue.name  = undefined;
    }
    
    $("#dialogue-box").addClass("invisible");
    $("#overlay").addClass("invisible");
    $("#options").addClass("invisible");
    $("#sprite").removeClass("released");
    $("#sprite").removeClass("invisible");
}


function triggerStory(marker) {
    // The only situation where the panel doesn't open at all is if the player isn't close enough.
    if(marker.options.opacity != 1) return false;
    
    // Will open overlay even if the ghost has no associated story in stories.json.
    $("#overlay").removeClass("invisible");
    $("#overlay").css("background-image", "url("+marker._backgrounds.main+")");
    
    if(playerData.switches[marker._name].goodbye) {
        $("#sprite").addClass("invisible");
        return false;
    }
    
    if(marker._sprites !== undefined) $("#sprite").prop("src", marker._sprites.idle);
    else $("#sprite").addClass("invisible");
    
    if(entities[marker._name].conversations === undefined) return false;
        
    $("#options-content").html("");
    
    var nodeOptions = [];
    var openNode;
    var nodeIndex;
    
    $.each(entities[marker._name].conversations, function(i, storynode) {
        let checkPlayerData = playerData.switches[marker._name];
        if(checkPlayerData.goodbye) return false;
        let conditionsMet = true;
        
        if(checkPlayerData.override !== "") {
            if(storynode.override != checkPlayerData.override) {
                conditionsMet = false;
            }
        } else if(storynode.override !== undefined) { // If character has no override set, but this dialogue node has an override requirement
            conditionsMet = false;
        }
        
        if(conditionsMet && storynode.required !== undefined) {
            $.each(storynode.required, function(j, val) {
                let check = val.split(":");
                
                if(check.length == 1) check.splice(0,0,marker._name);
                
                if(check[1].charAt(0) == "!") {
                    if(playerData.switches[check[0]][check[1].substr(1)]) {
                        conditionsMet = false;
                        return false;
                    }
                } else {
                    if(playerData.switches[check[0]][check[1]] === undefined || !playerData.switches[check[0]][check[1]]) {
                        conditionsMet = false;
                        return false;
                    }
                }
            });
        }
        
        if(conditionsMet && storynode.requiredItemState !== undefined) {
            $.each(storynode.requiredItemState, function(j, val2) {
                if(val2.charAt(0) != "!" && playerData.inventory[val2] === undefined) {
                    conditionsMet = false;
                    return false;
                } else if(val2.charAt(0) == "!" && playerData.inventory[val2.substr(1)] !== undefined) {
                    conditionsMet = false;
                    return false;
                }
            });
        }
        
        if(conditionsMet) {
            openNode = storynode;
            nodeOptions.push(storynode);
            var optionLabel = storynode.optionLabel || "...";
            if(storynode.altLabel !== undefined) {
                $.each(storynode.altLabel, function(j, val2){
                    let test;
                    let labelConditionsMet = true; 
                    $.each(val2.required, function(k, val3) {
                        if(val3.charAt(0) != "!"){
                            if(!playerData.switches[marker._name][val3]) {
                                labelConditionsMet = false;
                                return false;
                            }
                        } else if(playerData.switches[marker._name][val3.substr(1)]) {
                            labelConditionsMet = false;
                            return false;
                        }
                    });
                    if(labelConditionsMet) optionLabel = val2.label;
                    return false;
                });
            }
            
            $("#options-content").append($("<div></div>")
                .addClass("option-item")
                .html("<span class='option-pointer'>&#9758;</span>"+processText(optionLabel))
                .data("name", marker._name)
                .data("index", i)
                .click(function(){
                    startDialogue($(this).data("name"), $(this).data("index"));
                })
            );
        }
    });
    
    if(nodeOptions.length > 0) {
        $("#options").removeClass("invisible");
        return true;
    } else {
        return false;
    }
}


function triggerItemStory(item) { // uses opacity as an indicator of distance.
    if(item.options.opacity != 1) return false;
    if(item._deleted) return false;
    
    var openNode;
    var nodeIndex;
    
    for(var i=0; i < entities[item._name].popups.length; i++) {
        let storynode = entities[item._name].popups[i];
        let conditionsMet = true;
         
        if(storynode.required === undefined) {
            openNode = storynode;
            break;
        }
        
        $.each(storynode.required, function(i, val) {
            let check = storynode.required[i].split(":");
            if(check.length == 2) {
                if(check[1].charAt(0) == "!") {
                    if(playerData.switches[check[0]][check[1].substr(1)]) {
                        conditionsMet = false;
                        return false;
                    }
                } else if(playerData.switches[check[0]][check[1]] === undefined || !playerData.switches[check[0]][check[1]]) {
                    conditionsMet = false;
                    return false;
                }
            }
        });
        
        if(conditionsMet && storynode.requiredItemState !== undefined) {
            $.each(storynode.requiredItemState, function(j, val2) {
                if(val2.charAt(0) != "!" && playerData.inventory[val2] === undefined) {
                    conditionsMet = false;
                    return false;
                } else if(val2.charAt(0) == "!" && playerData.inventory[val2.substr(1)] !== undefined) {
                    conditionsMet = false;
                    return false;
                }
            });
        }
        
        if(conditionsMet) {
            openNode = storynode;
            nodeIndex = i;
            break;
        }
    }
    
    // set the item popup to show the current story node's dialogue.
    if(openNode.dialogue !== undefined) {
        popups[item._name].setContent(openNode.dialogue[0]);
        mymap.openPopup(popups[item._name]);
    }
    
    // add associated text to journal if the current node has journal text.
    if(openNode.journal !== undefined) {
            
        var journalEntry;
        
        if(typeof openNode.journal == "string") {
            journalEntry = openNode.journal;
        } else if(typeof openNode.journal == "array") {
            $.each(openNode.journal, function(i, val){
                let journalConditionsMet = true;
                if(!val.required !== undefined) {
                    $.each(val.required, function(j, val2){
                        if(val2.charAt(0) != "!") {
                            if(playerData.switches[item._name][val2]) {
                                journalConditionsMet = false;
                                return false;
                            }
                        } else if(!playerData.switches[item._name][val2.substr(1)]) {
                            journalConditionsMet = false;
                            return false;
                        }
                    });
                }
                if(journalConditionsMet) {
                    journalEntry = val.text;
                    return false;
                }
            });
        }
        
        if(journalEntry) {
            if(entities[item._name].associated) appendToJournal(entities[item._name].associated, nodeIndex+50, journalEntry);
            else appendToJournal(item._name, nodeIndex, journalEntry);
        }
    }
    
    if(openNode.pickUpOnComplete !== undefined) {
        $.each(openNode.pickUpOnComplete, function(i, val){
            addToInventory(val);
        });
    }
    
    paintItemMarkers();
}

function startDialogue(name, index) {
    let openNode = entities[name].conversations[index];
    if(openNode.releaseOnComplete) releaseGhost(name);
    
    if(openNode.oncomplete !== undefined) {
        $.each(openNode.oncomplete, function(i, val){
            val.charAt(0) != "!" ? playerData.switches[name][val] = true : playerData.switches[name][val.substr(1)] = false;
        });
    }
    
    // Add journal entry/ies to the log.
    if(openNode.journal !== undefined) {
        var journalEntry;
        if(typeof openNode.journal == "string") {
            journalEntry = openNode.journal;
        } else if(typeof openNode.journal == "array") {
            $.each(openNode.journal, function(i, val){
                let journalConditionsMet = true;
                if(val.required !== undefined) {
                    $.each(val.required, function(j, val2){
                        if(val2.charAt(0) != "!") {
                            if(playerData.switches[name][val2]) {
                                journalConditionsMet = false;
                                return false;
                            }
                        } else if(!playerData.switches[name][val2.substr(1)]) {
                            journalConditionsMet = false;
                            return false;
                        }
                    });
                }
                if(journalConditionsMet) {
                    journalEntry = val.text;
                    return false;
                }
            });
        }
        
        if(journalEntry) {
            appendToJournal(name, nodeIndex, journalEntry);
        }
    }
    
    
    if(openNode.pickUpOnComplete !== undefined) {
        $.each(openNode.pickUpOnComplete, function(i, val){
            addToInventory(val);
        });
    }
    
    if(openNode.closeOnSelect) {
        closeOverlay();
        return false;
    }
    
    // If this is simply an option that you click as a reply and there's no reply to anticipate from the ghost, dialogue ends and the option list is refreshed. 
    if(openNode.dialogue === undefined) {
        endDialogue(name);
        return false;
    }
    
    $("#dialogue-box").removeClass("invisible");
    $("#options").addClass("invisible");
    $("#dialogue-content").html("");
    $("#dialogue-content").removeClass()
    $("#dialogue-content").addClass(name.toLowerCase().replace(" ", "-"));
    
    activeDialogue.name = name;
    activeDialogue.lines = openNode.dialogue;
    activeDialogue.index = -1;
    activeDialogue.branchIndex = index;
    nextDialogue();
    
    paintCharacterMarkers();
    return true;
}

function nextDialogue() { // Fires whenever the next button is clicked, regardless of where in the conversation. This means there is currently a dialogue line onscreen.
        
    activeDialogue.index++;
        
    let currentLines = activeDialogue.lines;
    let currentName = activeDialogue.name;
    let currentIndex = activeDialogue.index;
    let currentBranchIndex = activeDialogue.branchIndex;
    
    // BEGIN BLOCK: If you've reached the end of the current dialogue (indicated by activeDialogue.index being the same as the length of the dialogue lines array), this opens the option menu again.
    if(currentIndex >= currentLines.length) {
        endDialogue(currentName);
        return false;
    }
    
    
    if(currentIndex < currentLines.length) {
        var dialogueLine = processText(currentLines[currentIndex].text);
        
        if(entities[currentName].dialogueLabel !== undefined && currentLines[currentIndex].noLabel !== true) dialogueLine = "<b>"+entities[currentName].dialogueLabel+"</b>:&emsp;"+dialogueLine;
        else if(currentLines[currentIndex].customLabel !== undefined) dialogueLine = "<b>"+currentLines[currentIndex].customLabel+"</b>:&emsp;"+dialogueLine;
        
        $("#dialogue-content").html(dialogueLine);
        
        if(currentLines[currentIndex].oncomplete !== undefined) {
            $.each(currentLines[currentIndex].oncomplete, function(i, val) {
                val.charAt(0) != "!" ? playerData.switches[currentName][val] = true : playerData.switches[currentName][val.substr(1)] = false;
            });
        }
        
        // add associated text to journal if the current node has text. First checks if that text has already been recorded.
        if(currentLines[currentIndex].journal !== undefined) {
            var journalEntry;
            
            if(typeof currentLines[currentIndex].journal == "string") {
                journalEntry = currentLines[currentIndex].journal;
            } else if(typeof currentLines[currentIndex].journal == "object") {
                $.each(currentLines[currentIndex].journal, function(i, val){
                    let journalConditionsMet = true;
                    if(val.required !== undefined) {
                        $.each(val.required, function(j, val2){
                            if(val2.charAt(0) == "!") {
                                if(playerData.switches[currentName][val2.substr(1)]) {
                                    journalConditionsMet = false;
                                    return false;
                                }
                            } else if(!playerData.switches[currentName][val2]) {
                                journalConditionsMet = false;
                                return false;
                            }
                        });
                    }
                    
                    if(journalConditionsMet) {
                        journalEntry = val.text;
                        return false;
                    }
                });
            }
            
            if(journalEntry) {
                appendToJournal(currentName, currentBranchIndex, journalEntry);
            }
        }
        
        // Send letter indicated by sendLetterOnComplete property.
        
        if(currentLines[currentIndex].sendLetterOnComplete !== undefined) {
            let letterDetails = currentLines[currentIndex].sendLetterOnComplete
            sendLetter(letterDetails.name, letterDetails.sender, letterDetails.subject, letterDetails.body);
        }
        
        
        // Takes the item indicated by removeOnComplete property, if it is defined.
        if(currentLines[currentIndex].removeOnComplete !== undefined) {
            $.each(currentLines[currentIndex], function(i, val){
                playerData.returnedInventory[val] = playerData.inventory[val];
                delete playerData.inventory[val];
            })
        }
        
        if(currentLines[currentIndex].clearOverride) { //Clear previous override first, THEN set new override
            playerData.switches[currentName].override = "";
        }
        
        if(currentLines[currentIndex].override !== undefined) {
            playerData.switches[currentName].override = currentLines[currentIndex].override;
        }
        
        // If it is the "goodbye" line, make the ghost disappear.
        if(currentLines[currentIndex].releaseOnComplete) releaseGhost(currentName)
        
    }
}

function releaseGhost(name) {
    playerData.switches[name].goodbye = true;
    $("#sprite").addClass("released");
    markers[name].setIcon(pins.InterestPoint);
    let complete = true;
    $.each(playerData.switches,function(i, val){
        if(entities[i].type=="character" && !val.goodbye) 
            {
                complete = false;
                return false;
            }
    });
    
    if(complete) sendLetter("Office of Mediums 4", "Office of Mediums", "Commendations on your excellent work!", "We have received news in writing that you have dealt with all the hauntings in Brisbane swiftly and effectively. We are proud to consider you a part of our team, and enclose the following medal as a token of appreciation for your excellent work:</p><p><img class='letter-image' src='https://webstockreview.net/images/medal-clipart-gold-medalist-7.png'></p>")
}

function endDialogue(name) {
    $("#dialogue-box").addClass("invisible");
    $("#options").removeClass("invisible");
    
    let storyContinue = triggerStory(markers[name]);
    if(!storyContinue) $("#options").addClass("invisible");
}


// JOURNAL FUNCTIONS

function toggleJournal() {
    if($("#journal").hasClass("invisible")) {
        $("#journal-button")
            .css("background-image", "url(assets/journal02.png)")
            .addClass("open");
        playerData.journalUnread = 0;
    } else {
        $("#journal-button")
            .css("background-image", "url(assets/journal01.png)")
            .removeClass("open");
    }
    $("#journal").toggleClass("invisible");
    refreshJournal();
}

function appendToJournal(name, index, text) {
    if(playerData.journal[name] === undefined) playerData.journal[name] = [];
    playerData.journal[name][index] = text;
    playerData.journalUnread++;
    refreshJournal();
}

function refreshJournal() {
    $("#journal-content").html("");
    $.each(playerData.journal, function(i, val){
        $.each(val, function(j, val2){
            if(val2) {
                $("#journal-content").append("<p>"+val2+"</p>");
            }
        });
        if(val.length > 0) $("#journal-content").append("<br>");
    });
    
    $(".journal-indicator")
        .addClass("invisible")
        .html(playerData.journalUnread);
    if(playerData.journalUnread > 0) {
        $(".journal-indicator").removeClass("invisible");
    }
}

// INVENTORY FUNCTIONS

function toggleInventory() {
    if($("#inventory").hasClass("invisible")) {
        $("#inventory-button")
            .css("background-image", "url(assets/inventory02.png)")
            .addClass("open");
        $.each(playerData.inventory, function(i, val){
            val.unread = false;
        })
    } else {
        $("#inventory-button")
            .css("background-image", "url(assets/inventory01.png)")
            .removeClass("open");
    }
    refreshInventory();
    $("#inventory").toggleClass("invisible");
}

function addToInventory(itemName) {
    items[itemName]._deleted = true;
    playerData.switches[itemName].taken = true;
    playerData.inventory[itemName] = {
        "name": itemName,
        "index": Object.keys(playerData.inventory).length,
        "src": entities[itemName].pin,
        "unread": true
    };
    
    setTimeout(function() {
        if($("#inventory").hasClass("invisible")) {
            toggleInventory();
        }
    }, 1000);
}

function refreshInventory() {
    $("#inventory-content").html("");
    $.each(playerData.inventory, function(key, val) {
        $("#inventory-content").append($("<div></div>")
            .addClass("inventory-item")
            .append($("<img>")
                .attr("src", val.src)
                .addClass("inventory-sprite")
            )
            .append($("<div></div>")
                .addClass("tooltip")
                .html(val.name)
            )
        );
    });
}


//LETTER FUNCTIONS

function toggleLetters() {
    refreshLetters();
    if($("#letters").hasClass("invisible")) {
        $("#letters-button")
            .css("background-image", "url(assets/letterfile02.png)")
            .addClass("open");
    } else {
        $("#letters-button")
            .css("background-image", "url(assets/letterfile01.png)")
            .removeClass("open");
    }
    $("#letters").toggleClass("invisible");
}

function refreshLetters() {
    $(".new-indicator").addClass("invisible");
    $("#letters-content").html("");
    let unreadCount = 0;
    $.each(playerData.letters, function(key, val) {
        if(val.unread) unreadCount++
        
        $("#letters-content").append($("<div></div>")
            .append($("<h2></h2>")
                .on("click", function(){toggleOneLetter(this)})
                .data("name", val.name)
                .addClass("letter-header")
                .html("<span-class='letter-pointer'>&#9758;</span><b>"+val.header+"</b> "+val.subject)
            )
            .append($("<div></div>")
                .html(val.content)
                .addClass("letter-body invisible")
            )
            .addClass("letter-tab")
            .addClass(val.unread ? "unread": "")
        );
    });
    refreshLetterCounter();
}

function sendLetter(lettername, header, subject, content) {
    if(playerData.letters[lettername] === undefined) {
        playerData.letters[lettername] = {
            "name": lettername,
            "header": header,
            "subject": subject,
            "content": content,
            "unread": true
        };
        refreshLetters();
    }
}

function refreshLetterCounter() {
    $(".new-indicator").addClass("invisible");
    let unreadCount = 0;
    $.each(playerData.letters, function(key, val) {
        if(val.unread) unreadCount++
    });
    if(unreadCount) {
        $(".new-indicator")
            .removeClass("invisible")
            .empty()
        $(".string-indicator").append("(");
        $(".new-indicator").append(unreadCount);
        $(".string-indicator").append(" unread)");
    }
}

function toggleOneLetter(div) {
    playerData.letters[$(div).data("name")].unread = false;
    $(div).parent()
        .removeClass("unread")
        .children(".letter-body").toggleClass("invisible")
    refreshLetterCounter();
    $(".letter-content").addClass("invisible");
}


//COMPASS

function getClosestGhost(coords) {
    let closest;
    let closestDist;
    $.each(markers, function(key, val){
        if(val._awake) {
            var dist = L.point(coords).distanceTo(L.point(val._latlng.lat, val._latlng.lng));
            if(dist < closestDist || closestDist === undefined) {
                closestDist = dist;
                closest = val;
            }
        }
    });
    if(closest) return closest;
    else return false;
}

function turnCompass(targetcoords) {
    let dX = targetcoords[0] - mycoords[0];
    let dY = targetcoords[1] - mycoords[1];
    let bearing = 360*Math.atan2(dY,dX)/(2*Math.PI);
    $("#compass-needle").css("transform", "rotate("+bearing+"deg)");
}

function compassToClosestGhost() {
    let closestGhost = getClosestGhost(mycoords);
    if(Object.keys(markers).length > 0) turnCompass([closestGhost._latlng.lat, closestGhost._latlng.lng]);
}


// SOUND
function loadSound() {
    screams = document.createElement("audio");
    screams.src="sounds/screams.mp3";
    screams.volume=0;
    screams.loop = true;
    screams.muted = true;
    screams.play();
    document.body.appendChild(screams);
}

function toggleSound() {
    if(!screams.muted) {
        screams.muted = true;
        $("#volume-button").css("background-image", 'url("assets/soundoff.png")');
    }
    else {
        screams.muted = false;
        screams.play();
        $("#volume-button").css("background-image", 'url("assets/soundon.png")');
    }
}


//NOTE PANEL

function toggleNotes(){
    $("#notes").toggleClass("invisible");
    if(!$("#notes").hasClass("invisible")) localStorage.noteSeen = "true";
}


//UTILITY

function getHour() {
    myDate = new Date(Date.now());
    return myDate.getHours();
}

function getDist(coords1, coords2){
    return Math.sqrt(Math.pow(coords1[0]-coords2[0], 2) + Math.pow(coords1[1]-coords2[1], 2));
}

function clamp(number, min, max) {
    return number < min ? min : (number > max ? max : number);
}

function processText(input) {
    let output = input;
    
    const thisYear = myDate.getFullYear();
    
    output = output.replace(/\{([a-zA-Z]*)([0-9]*)(.*)\}/g, function(x, p1, p2, p3) {
        if(p1 == "CurrentYear") return thisYear.toString();
        else if(p1 == "DressAddress") {
            return items["Judith's dress"]._address.results[0].formatted.split(",").slice(0, 2).join(",");
        }
        else if(p1 == "YearDifference") {
            var year = parseInt(p2);
            var yearDiff = thisYear - year;
            if(p3 == "approx") return numberToWords.toWords(10*Math.round(yearDiff/10));
            else return numberToWords.toWords(yearDiff);
        }
    });
    output = output.charAt(0).toUpperCase() + output.substr(1);
    return output;
}

function selectRandom(array) {
    return array[Math.floor(Math.random()*array.length)];
}

function getFullScript() {
    var fullScript = "";
    $.each(entities, function(i, val){
        fullScript+="\nCHARACTER: "+i;
        if(val.popups) {
            $.each(val.popups, function(j, val2){
                $.each(val2.dialogue, function(k, val3){
                    fullScript+="\n"+val3;
                });
            });
        }
        if(val.conversations) {
            $.each(val.conversations, function(j, val2){
                fullScript+="\nMe: "+val2.optionLabel;
                if(val2.altLabel) {
                    $.each(val2.altLabel, function(l, val3){
                        fullScript+=" / "+val3.label;
                    });
                }
                $.each(val2.dialogue, function(k, val3){
                    fullScript+="\n";
                    if(!val3.noLabel) fullScript+=val.name+": " + val3.text;
                });
            });
        }
        fullScript+="\n";
    });
    return fullScript;
}