/* Ariadne's Thread level editor: everything that can be put in a passage
   (14 Oct 2026). Terrain is painted onto the map's tiles; everything else is
   an object, { type, x, y, ... }, as js/rat-race.js reads it (THE LEVELS AS
   DATA there). For each: its name, where it sits in the library, what it
   starts with, and the fields the inspector shows. */
(function () {
    "use strict";

    /* TERRAIN: brushes. layer: "tiles" (what Scout meets), "back" (walls
       behind, only to look at) or "water". */
    const TERRAIN = [
        { id: "wall", tile: "#", layer: "tiles", label: "Wall", hint: "Solid rock or timber. Scout stands on it and is stopped by it." },
        { id: "fake", tile: "%", layer: "tiles", label: "Walk-behind wall", hint: "Looks like wall; Scout walks through it into whatever is hidden behind. A room reached only this way is covered until he steps in." },
        { id: "backwall", tile: "#", layer: "back", label: "Background wall", hint: "A wall behind everything, only to look at. Its shade is the Background tone in Level settings." },
        // (23 Oct 2026, the owner's: "If you can make drawing slopes more intuitive in the editor that would be great") paint a slope and
        // it works itself out from what is round it: a floor's (rock under it) or a ceiling's (rock over it), and which way it rises
        { id: "slopeAuto", tile: "S", layer: "tiles", label: "Slope, steep (auto)", hint: "Paint a steep slope and it shapes itself: a floor's slope with rock under it, a ceiling's with rock over it; rising towards the wall beside it, or carrying on from the slope tiles next to it. Paint a staircase of them, a tile across for a tile up." },
        { id: "gentleAuto", tile: "G", layer: "tiles", label: "Slope, gentle (auto)", hint: "Paint a gentle slope, two tiles to a row, and it shapes itself: a floor's or a ceiling's, rising towards the wall beside it or carrying on from the slope next to it, each pair sorted into its two halves." },
        // (23 Oct 2026) one brush each way: painted along the slope, a row's run of them is made foot, top, foot, top from its low end (core.js, gentleRuns)
        { id: "slopeR", tile: "{", layer: "tiles", label: "Gentle slope ↗", hint: "Wall sloping gently up to the right, a tile up over two across. Paint it along the slope, two tiles to each row (the next two a row up): each pair sorts itself into its foot and its top. Scout walks up and down it." },
        { id: "slopeL", tile: "]", layer: "tiles", label: "Gentle slope ↖", hint: "Wall sloping gently up to the left, a tile up over two across. Paint it along the slope, two tiles to each row (the next two a row up): each pair sorts itself into its foot and its top. Scout walks up and down it." },
        { id: "steepR", tile: "/", layer: "tiles", label: "Steep slope ↗", hint: "Wall sloping steeply up to the right, a tile up for a tile across. Too steep to stand on: Scout slides down it, and only a jump gets him off it before its foot." },
        { id: "steepL", tile: "\\", layer: "tiles", label: "Steep slope ↖", hint: "Wall sloping steeply up to the left, a tile up for a tile across. Too steep to stand on: Scout slides down it, and only a jump gets him off it before its foot." },
        { id: "ceilSteepR", tile: "u", layer: "tiles", label: "Steep ceiling ↘", hint: "A ceiling sloping steeply down to the right, the rock over the line: the underside of an overhang, a sloping roof. Scout's head stops at it." },
        { id: "ceilSteepL", tile: "n", layer: "tiles", label: "Steep ceiling ↙", hint: "A ceiling sloping steeply down to the left, the rock over the line. Scout's head stops at it." },
        { id: "ceilGentleR", tile: "k", layer: "tiles", label: "Gentle ceiling ↘", hint: "A ceiling sloping gently down to the right, two tiles to a row (they sort themselves into their halves), the rock over the line." },
        { id: "ceilGentleL", tile: "y", layer: "tiles", label: "Gentle ceiling ↙", hint: "A ceiling sloping gently down to the left, two tiles to a row (they sort themselves into their halves), the rock over the line." },
        { id: "beam", tile: "=", layer: "tiles", label: "Platform", hint: "Stand on it from above, jump up through it, down + jump drops through." },
        { id: "ladder", tile: "H", layer: "tiles", label: "Ladder", hint: "Climb with up and down; its top rung is a floor." },
        { id: "ladderOld", tile: "W", layer: "tiles", label: "Weathered ladder", hint: "A ladder, as any other to climb, its timber old and grey, a rung split here and there." },
        { id: "ladderBroken", tile: "B", layer: "tiles", label: "Ladder, broken foot", hint: "A ladder, as any other to climb, its lowest tile snapped off: the rails splintered, a rung hanging. Its foot is broken wherever its lowest tile is." },
        { id: "rope", tile: "|", layer: "tiles", label: "Rope", hint: "Catches Scout in the air; climb it." },
        { id: "spikes", tile: "^", layer: "tiles", label: "Spikes", hint: "A tile deep: the floor under them is the next row down." },
        { id: "ice", tile: "i", layer: "tiles", label: "Ice floor", hint: "Rock with ice on top: slippery underfoot." },
        { id: "block", tile: "2", layer: "tiles", label: "Stone block", hint: "A solid block in the way, drawn as a cut block where the zone has one." },
        { id: "crumble", tile: "c", layer: "tiles", label: "Crumbling ledge", hint: "Gives way a moment after Scout stands on it, and comes back." },
        { id: "rubble", tile: "X", layer: "tiles", label: "Rubble", hint: "Solid until blown with dynamite." },
        { id: "secretRubble", tile: "Q", layer: "tiles", label: "Secret rubble", hint: "Rubble sealing a secret: what lies behind stays hidden until it is blown." },
        { id: "roots", tile: "V", layer: "tiles", label: "Roots", hint: "Solid until Scout's torch burns them (and the torch with them)." },
        // (23 Oct 2026) the rails, a layer of their own, painted a tile at a time on what Scout walks on
        { id: "rail", tile: "-", layer: "rails", label: "Rails", hint: "Mine-cart rails, painted a tile at a time where a cart rolls: on a floor, a wall's top, or along a slope. A cart that comes off their end digs in and stops." },
        { id: "railBuffer", tile: "b", layer: "rails", label: "Rails, end buffers", hint: "The rails' end, with buffers (at whichever end no rail joins it). A cart is stopped dead by them; going fast, Scout is thrown out over them." },
        { id: "railBroken", tile: "x", layer: "rails", label: "Rails, broken end", hint: "The rails broken off short, the rail bent up. A cart comes off them and digs in; going fast, Scout is thrown out." },
        { id: "railHang", tile: "v", layer: "rails", label: "Rails, hanging off a ledge", hint: "Paint it in the air just past the ledge the rails run to: the rails broken and bent down over the edge. A cart rolls off and falls." },
        { id: "water", tile: "~", layer: "water", label: "Water", hint: "Standing water to swim in. The sea's lines are in Level settings." },
        { id: "dark", tile: "d", layer: "dark", label: "Dark", hint: "Paint where it is dark, as the Depths are: only Scout's own light, lanterns and lights light it. Fades where it meets lit air, dark right up to rock. Its softness, darkness and colour are under Level. Press L to preview." },
        { id: "darkTurn", tile: "t", layer: "dark", label: "Dark transition", hint: "Paint between dark and light: the dark fades across it, full beside the Dark and none beside the light, as wide and in whatever shape you paint it." },
        { id: "murk", tile: "m", layer: "water", label: "Murky water", hint: "Stagnant water, thick and dark green, a skin of scum on it: swum in just as water is." },
        { id: "stop", tile: "e", layer: "tiles", label: "Float stop", hint: "Air, but a float's shaft ends at it." },
        { id: "trapdoor", tile: "_", layer: "tiles", label: "Secret trapdoor", hint: "A way out of a secret: hidden from below, as roof." },
        { id: "crawl", tile: ",", layer: "tiles", label: "Secret crawl", hint: "A way out of a secret: the open end of a crawl." },
        { id: "secretLadder", tile: "h", layer: "tiles", label: "Secret ladder", hint: "A ladder up out of a secret, left in plain sight." },
        { id: "secretRope", tile: "j", layer: "tiles", label: "Secret rope", hint: "A rope up out of a secret, left in plain sight." },
        { id: "air", tile: ".", layer: "tiles", label: "Air (erase)", hint: "Clears the tile. The right mouse button erases with any brush." }
    ];
    // what each tile letter is called, for the status bar and the collision key
    const TILE_NAMES = { "#": "Wall", "%": "Walk-behind wall", "=": "Platform", H: "Ladder", W: "Weathered ladder", B: "Ladder, broken foot", "|": "Rope", "^": "Spikes", i: "Ice floor", "2": "Stone block", c: "Crumbling ledge", X: "Rubble", Q: "Secret rubble", V: "Roots", "~": "Water", m: "Murky water", d: "Dark", t: "Dark transition", e: "Float stop", _: "Secret trapdoor", ",": "Secret crawl", h: "Secret ladder", j: "Secret rope", ".": "Air" };

    // Field kinds: num, int, bool, tri (default / yes / no), select, text, area, color, range
    const F = {
        stomp: { key: "stomp", label: "Stompable", kind: "tri", hint: "Whether landing on it finishes it. Default is the creature's own." },
        dir: { key: "dir", label: "Sets off", kind: "select", options: [[-1, "Left"], [1, "Right"]], def: -1 },
        speed: { key: "speed", label: "Speed", kind: "range", min: 0.25, max: 4, step: 0.05, def: 1, hint: "1 is its usual pace." },
        path: { key: "path", label: "Path", kind: "path", hint: "With the Path tool (P): click to add waypoints after where it starts." },
        pathSpeed: { key: "pathSpeed", label: "Path speed", kind: "range", min: 0.1, max: 4, step: 0.05, def: 0.6, when: o => o.path && o.path.length },
        pause: { key: "pause", label: "Wait at ends", kind: "int", min: 0, max: 600, def: 0, unit: "frames", when: o => o.path && o.path.length },
        loop: { key: "loop", label: "Loop back to start", kind: "bool", when: o => o.path && o.path.length }
    };
    const foe = (label, extra, opts) => Object.assign({ cat: "Creatures", label, fields: [F.stomp, F.dir, F.speed, ...(extra || []), F.path, F.pathSpeed, F.pause, F.loop] }, opts || {});

    const TYPES = {
        // PICKUPS
        coin: { cat: "Pickups", label: "Coin", sprite: "coin", paint: true },
        gem: { cat: "Pickups", label: "Ruby", sprite: "gem", fields: [{ key: "rid", label: "Ruby ID", kind: "text", hint: "Its name in the players' saved progress. Keep it when moving a ruby, or players who found it lose it." }] },
        life: { cat: "Pickups", label: "Extra life", sprite: "hat" },
        key: { cat: "Pickups", label: "Key", sprite: "key", fields: [{ key: "opens", label: "Opens", kind: "text", placeholder: "the exit door", hint: "Blank: the passage's exit door. Or the lock name of a doorway." }] },
        dynamite: { cat: "Pickups", label: "Dynamite", sprite: "dynamite", hint: "Lasts the whole passage. Walking into rubble plants a stick." },
        knife: { cat: "Pickups", label: "Knife", sprite: "knife", hint: "Kept for the passage. Beside a hanging crate's rope, Z or X cuts it." },
        // DOORS
        exit: { cat: "Doors", label: "Exit door", sprite: "door", single: true, hint: "Opened with the passage's key; walking in finishes the passage." },
        doorway: { cat: "Doors", label: "Doorway", sprite: "door", hint: "Up in front of it goes in, and out of the doorway named in To.", fields: [
            { key: "id", label: "Name", kind: "text", placeholder: "A" }, { key: "to", label: "Leads to", kind: "text", placeholder: "B" },
            { key: "lock", label: "Lock", kind: "text", placeholder: "none", hint: "A key whose Opens says this name unlocks it." }] },
        blast: { cat: "Doors", label: "Blast door", sprite: "blast", grid: true, hint: "Three tiles tall, shut until its wheel is turned (Z and X, one after the other).", fields: [{ key: "turns", label: "Turns to open", kind: "int", min: 1, max: 60, def: 12 }] },
        hatch: { cat: "Doors", label: "Hatch", sprite: "hatch", grid: true, hint: "Three tiles wide, shut until its wheel is turned.", fields: [{ key: "turns", label: "Turns to open", kind: "int", min: 1, max: 60, def: 12 }] },
        pump: { cat: "Doors", label: "Pump", sprite: "wheel", grid: true, hint: "Turned, it drains the sea to the Drain line (Level settings).", fields: [{ key: "turns", label: "Turns to open", kind: "int", min: 1, max: 60, def: 12 }] },
        // CREATURES
        mummy: foe("Mummy", [], { hint: "Walks as a rat does. Stomped once it falls to a crawling half; the second stomp finishes it." }),
        snake: { cat: "Creatures", label: "Snake in an urn", grid: true, hint: "Rattles its urn when Scout comes near, strikes out a tile at him and draws back. Its head, out, can be stomped." },
        rat: foe("Maze rat"), bat: foe("Bat", [{ key: "range", label: "Swoop width", kind: "int", min: 4, max: 200, def: 44, unit: "px" }]),
        spider: foe("Spider", [{ key: "drop", label: "Drop length", kind: "int", min: 0, max: 200, def: 68, unit: "px" }]),
        beetle: foe("Stone beetle", null, { hint: "The first stomp turns it over, the second finishes it." }),
        lizard: foe("Wall lizard"), hare: foe("Snow hare"), crawler: foe("Ice crawler"), grub: foe("Glow-grub"),
        wisp: foe("Will-o'-the-wisp"), bot: foe("Bilge bot"), jelly: foe("Jellyfish", [{ key: "range", label: "Drift height", kind: "int", min: 0, max: 200, def: 22, unit: "px" }]),
        hammer: { cat: "Creatures", label: "Drop hammer", sprite: "hammer", hint: "Hangs under the roof above it; shakes, then drops to the floor below." },
        piston: { cat: "Creatures", label: "Piston", grid: true, hidden: true, hint: "Clockwork Vault: put it against a wall; it punches out on the off-beat." },
        steam: { cat: "Creatures", label: "Steam valve", grid: true, hint: "Put it against a wall: it blows out the other way.", fields: [{ key: "every", label: "Cycle", kind: "int", min: 200, max: 1200, def: 200, unit: "frames" }] },
        // MECHANICS
        start: { cat: "Mechanics", label: "Scout's start", sprite: "scoutIdle", single: true },
        flag: { cat: "Mechanics", label: "Checkpoint", sprite: "flag", single: true },
        sign: { cat: "Mechanics", label: "Signpost", sprite: "sign", fields: [{ key: "text", label: "Words", kind: "area", hint: "[JUMP], [TURN] say the player's own keys." }] },
        crate: { cat: "Mechanics", label: "Pushable crate", sprite: "pushCrate", fields: [{ key: "hang", label: "Hangs from a rope", kind: "bool", hint: "Up to whatever is above it. With the knife, Z or X beside the rope cuts it down; it lands on what is below (creatures under it are flattened) and can then be pushed." }] },
        mover: { cat: "Mechanics", label: "Moving platform", fields: [
            { key: "axis", label: "Moves", kind: "select", options: [["h", "Across"], ["v", "Up and down"], ["path", "Along a path"]], def: "h" },
            { key: "min", label: "From", kind: "int", when: o => o.axis !== "path", unit: "px" }, { key: "max", label: "To", kind: "int", when: o => o.axis !== "path", unit: "px" },
            { key: "w", label: "Width", kind: "int", min: 16, max: 192, step: 16, def: 48, unit: "px" },
            { key: "speed", label: "Speed", kind: "range", min: 0.1, max: 4, step: 0.05, def: 0.7 },
            { key: "pause", label: "Wait at ends", kind: "int", min: 0, max: 600, def: 50, unit: "frames" },
            { key: "dir", label: "Sets off", kind: "select", options: [[1, "Right / down"], [-1, "Left / up"]], def: 1, when: o => o.axis !== "path" },
            /* (23 Oct 2026, the owner's: lifts side by side) the crane over an up-and-down one, and linking two side by side */
            { key: "crane", label: "Crane", kind: "select", options: [["auto", "Auto"], ["left", "Winch on the left"], ["right", "Winch on the right"], ["compact", "Compact (pulley block)"], ["none", "No crane"]], def: "auto", when: o => o.axis === "v", hint: "Auto: lifts side by side share one headframe, winches at its ends. The winch's side is for a crane on its own. Compact: a pulley block hung from the roof, or on a gallows post in the open, for tight spots. No crane: dress it yourself." },
            { key: "pair", label: "Linked pair", kind: "bool", when: o => o.axis === "v", hint: "Tick this on two lifts side by side: one rope over both, as one goes up the other comes down. The left one sets the pace; the right one's height follows it." },
            { key: "path", label: "Path", kind: "path", when: o => o.axis === "path" }, { key: "loop", label: "Loop back to start", kind: "bool", when: o => o.axis === "path" }] },
        float: { cat: "Mechanics", label: "Float", hint: "Rides the sea up and down its shaft." },
        icicle: { cat: "Mechanics", label: "Icicle", sprite: "icicle" },
        falls: { cat: "Mechanics", label: "Falling rocks", hint: "A crack in the roof a rock drops from.", fields: [{ key: "period", label: "Every", kind: "int", min: 60, max: 1200, unit: "frames", placeholder: "170-229" }] },
        brazier: { cat: "Mechanics", label: "Brazier", sprite: "brazier", fields: [{ key: "lit", label: "Starts alight", kind: "bool" }, { key: "group", label: "Fire gate group", kind: "text", placeholder: "none", hint: "Braziers with the same group open the fire gate of that group once every one of them is lit." }] },
        // (22 Oct 2026) THE NEW MECHANICS
        swing: { cat: "Mechanics", label: "Swinging rope", hint: "Hangs from the roof where it is put. Scout catches it by its knotted end in a jump (no climbing it); pushing the way it swings builds it up, against it slows it; jump lets go flying, down drops off. A chandelier he hangs from by its hoop.", fields: [
            { key: "kind", label: "Kind", kind: "select", options: [["rope", "Rope"], ["chandelier", "Chandelier"]], def: "rope" },
            { key: "len", label: "Length", kind: "int", min: 24, max: 320, unit: "px", hint: "A rope: to its end. A chandelier: its chain, to the ring over it." },
            { key: "angle", label: "Starts swung", kind: "int", min: -60, max: 60, def: 0, unit: "°" }] },
        zipline: { cat: "Mechanics", label: "Zipline", hint: "A cable from here to its other end (drag the end). Scout catches it in a jump and rides it down; jump or down lets go. A level one he goes along hand over hand.", fields: [
            { key: "dx", label: "End across", kind: "int", min: -800, max: 800, unit: "px" }, { key: "dy", label: "End down", kind: "int", min: -400, max: 400, unit: "px" }] },
        scree: { cat: "Mechanics", label: "Scree slope (box)", sizable: true, hint: "Loose rock heaped in a slope across the box, from its top on the high side to its bottom on the low side. Scout slides down it, faster and faster, and cannot walk back up. Leave the box's tiles empty, with rock under it and a floor at its foot.", fields: [
            { key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Drop", kind: "int", min: 8, unit: "px" }, { key: "dir", label: "Down to the", kind: "select", options: [[1, "Right"], [-1, "Left"]], def: 1 }] },
        quicksand: { cat: "Mechanics", label: "Quicksand (box)", sizable: true, hint: "Scout sinks in it and can barely move; only jumping keeps him up, a weaker jump the deeper he is. Over his head is the end of him. Leave its tiles empty, in a pit.", fields: [
            { key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Depth", kind: "int", min: 16, step: 16, unit: "px" }] },
        minecart: { cat: "Mechanics", label: "Mine cart", grid: true, hint: "Stands till Scout gets in (dropping in, or up or down beside it), then rolls off its way, faster downhill and slower up. Forward keeps it rolling, back brakes it; jump jumps it. On rails (Terrain: Rails) it keeps to them: buffers stop it dead and throw him forwards over them; off the rails' end (or a broken end) it is flung off them as it was going and he is thrown out with it. A wall hit fast throws him out (unhurt); a low roof knocks him out. Parked till he first gets in. Stopped, up or jump gets him out.", fields: [
            { key: "dir", label: "Rolls", kind: "select", options: [[1, "Right"], [-1, "Left"]], def: 1 }, { key: "speed", label: "Speed", kind: "range", min: 1, max: 4, step: 0.1, def: 2.4, hint: "2.6 and more crashes into a wall at the end; less stops gently." }] },
        rails: { cat: "Mechanics", label: "Mine rails (old)", sizable: true, hidden: true, hint: "The old one-piece track, before the rails were painted a tile at a time (Terrain: Rails). Still laid as rails where it is.", fields: [{ key: "w", label: "Length", kind: "int", min: 16, step: 16, unit: "px" }] },
        pool: { cat: "Mechanics", label: "Pool (box)", sizable: true, hint: "Water a sluice lever raises and lowers: between the box's top and Drop below it. Swim in it as any water.", fields: [
            { key: "name", label: "Name", kind: "text", placeholder: "A", hint: "The lever that works it has this name in its Pool." },
            { key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Height", kind: "int", min: 16, step: 16, unit: "px" },
            { key: "drop", label: "Drop", kind: "int", min: 0, unit: "px", hint: "How far the water goes down when let out (the box's height: all of it)." }, { key: "low", label: "Starts let out", kind: "bool" }] },
        sluice: { cat: "Mechanics", label: "Sluice lever", grid: true, hint: "Up in front of it pulls it: its pool's water goes to its other line.", fields: [{ key: "pool", label: "Pool", kind: "text", placeholder: "A" }] },
        torchbracket: { cat: "Mechanics", label: "Torch on a bracket", grid: true, hint: "Scout takes a torch from it (as many as he likes). It burns for a while, afresh at a lit brazier; held to an unlit one it lights it. Water puts it out.", fields: [{ key: "burn", label: "Burns for", kind: "int", min: 5, max: 600, def: 40, unit: "s" }] },
        firegate: { cat: "Doors", label: "Fire gate", grid: true, hint: "Three tiles tall, shut until every brazier of its group is lit; then it rises into the roof.", fields: [{ key: "group", label: "Group", kind: "text", placeholder: "A" }] },
        alarm: { cat: "Mechanics", label: "Alarm", hint: "Passing it (or lifting a key beside it) sets the sea surging." },
        tank: { cat: "Mechanics", label: "Oxygen tank", sprite: "tank" },
        vent: { cat: "Mechanics", label: "Air vent", hint: "A big bubble to breathe, every so often.", fields: [{ key: "every", label: "Bubble every", kind: "int", min: 60, max: 1200, def: 200, unit: "frames" }] },
        current: { cat: "Mechanics", label: "Current", sizable: true, fields: [
            { key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Height", kind: "int", min: 16, step: 16, unit: "px" },
            { key: "flow", label: "Flows", kind: "flow" },
            { key: "strength", label: "Strength", kind: "range", min: 0.25, max: 3, step: 0.05, def: 1 }] },
        // THE NEW ZONES (14 Oct 2026)
        switch: { cat: "Mechanics", label: "Timed block", grid: true, hidden: true, hint: "A block that comes and goes. Beat A and Beat B: the Clockwork Vault's, shut on alternate bars. Rain root: grows across while it rains (Overgrown Ruins). Sun bramble: up while the sun is out.", fields: [
            { key: "kind", label: "Kind", kind: "select", options: [["beatA", "Beat block A"], ["beatB", "Beat block B"], ["rain", "Rain root"], ["sun", "Sun bramble"]], def: "beatA" }] },
        lava: { cat: "Mechanics", label: "Lava", sizable: true, hint: "Molten metal: a touch is the end.", fields: [{ key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Height", kind: "int", min: 16, step: 16, unit: "px" }] },
        spout: { cat: "Mechanics", label: "Slag spout", grid: true, hidden: true, hint: "Lava Foundry: sends a raft drifting off along the lava every few seconds. Put it at the lava's surface." },
        conveyor: { cat: "Mechanics", label: "Conveyor belt", sizable: true, hint: "A floor that carries Scout along.", fields: [{ key: "w", label: "Length", kind: "int", min: 16, step: 16, unit: "px" }, { key: "dx", label: "Runs", kind: "select", options: [[1, "Right"], [-1, "Left"]], def: 1 }] },
        hourglass: { cat: "Mechanics", label: "Hourglass", grid: true, hidden: true, hint: "Sandfall Tomb: walk into it to turn it, and the sand goes to its other line (the sea's low and high lines in Level settings)." },
        // THE STEAMWORKS (14 Oct 2026)
        gear: { cat: "Mechanics", label: "Cog", hint: "A great cog with small teeth, solid round its rim: Scout lands on it and stands on its teeth, and as it turns it carries him round (off the side, if he stands still). Put it at the wheel's middle. Static: it never turns.", fields: [
            { key: "static", label: "Static (doesn't turn)", kind: "bool" },
            { key: "r", label: "Radius", kind: "int", min: 16, max: 160, def: 40, unit: "px" },
            { key: "speed", label: "Speed", kind: "range", min: 0.1, max: 3, step: 0.05, def: 0.6, when: o => !o.static },
            { key: "dir", label: "Turns", kind: "select", options: [[1, "Clockwise"], [-1, "Anticlockwise"]], def: 1, when: o => !o.static },
            { key: "phase", label: "Starting angle", kind: "int", min: 0, max: 359, def: 0, unit: "°" }] },
        burner: { cat: "Mechanics", label: "Fire jet", grid: true, hint: "A short pipe in a floor, roof or wall that roars out flame by turns; its mouth glows before it fires.", fields: [
            { key: "dir", label: "Fires", kind: "select", options: [["up", "Up"], ["down", "Down"], ["left", "Left"], ["right", "Right"]], def: "up" },
            { key: "len", label: "Flame length", kind: "int", min: 16, max: 160, def: 44, unit: "px" },
            { key: "every", label: "Cycle", kind: "int", min: 60, max: 1200, def: 170, unit: "frames" },
            { key: "on", label: "Burns for", kind: "int", min: 10, max: 600, def: 60, unit: "frames" },
            { key: "phase", label: "Offset", kind: "int", min: 0, max: 1200, unit: "frames", placeholder: "auto" }] },
        ooze: { cat: "Mechanics", label: "Dripping pipe", grid: true, hint: "A pipe down from the roof: a glob of molten metal swells at its mouth, then drops, slowly. It burns Scout. Put it in the tile under the roof.", fields: [
            { key: "len", label: "Pipe length", kind: "int", min: 6, max: 160, def: 12, unit: "px" },
            { key: "every", label: "Drips every", kind: "int", min: 80, max: 1200, def: 170, unit: "frames" },
            { key: "phase", label: "Offset", kind: "int", min: 0, max: 1200, unit: "frames", placeholder: "auto" }] },
        // THE ARCADE (14 Oct 2026)
        bumper: { cat: "Mechanics", label: "Pinball bumper", grid: true, hint: "Touch it and it throws Scout off, away from its middle; come down on its top and it bounces him up high. Set on a floor, it is a springboard.", fields: [
            { key: "color", label: "Colour", kind: "select", options: [[0, "Pink"], [1, "Cyan"], [2, "Yellow"], [3, "Lime"], [4, "Violet"]], placeholder: "auto" },
            { key: "power", label: "Power", kind: "range", min: 2, max: 9, step: 0.1, def: 5.4 },
            { key: "r", label: "Size", kind: "int", min: 6, max: 14, def: 9, unit: "px" }] },
        spring: { cat: "Mechanics", label: "Spring pad", grid: true, hint: "On a floor: step on it and it flings Scout up (at the default power, about five tiles).", fields: [
            { key: "power", label: "Power", kind: "range", min: 4, max: 11, step: 0.1, def: 7.4 }] },
        // THE ARCADE'S FURNISHINGS (14 Oct 2026): machines that play, vines that sway, neon signs
        machine: { cat: "Arcade", label: "Arcade machine", hint: "A machine from the arcade: an upright cabinet, a pinball table, a claw machine or an old television. Its screen plays, and lights the wall about it.", fields: [
            { key: "kind", label: "Machine", kind: "select", options: [["cab", "Upright cabinet"], ["pinball", "Pinball table"], ["claw", "Claw machine"], ["tv", "Television"]], def: "cab" },
            { key: "on", label: "Switched on", kind: "bool", def: true },
            { key: "show", label: "On its screen", kind: "select", options: [["", "Any"], ["space", "Space invaders"], ["maze", "A maze"], ["pong", "Bat and ball"], ["racer", "A racer"], ["static", "Static"]], def: "", when: o => o.kind !== "pinball" && o.kind !== "claw" },
            { key: "screen", label: "Screen colour", kind: "color", def: "#3effe8" },
            { key: "marquee", label: "Sign colour", kind: "color", def: "#ff3ea8", when: o => o.kind !== "tv" },
            { key: "body", label: "Cabinet colour", kind: "color", def: "#2a1c46" },
            { key: "flicker", label: "Flicker", kind: "range", min: 0, max: 1, step: 0.05, def: 0 },
            { key: "glow", label: "Lights the wall", kind: "bool", def: true },
            { key: "flip", label: "Mirrored", kind: "bool" },
            { key: "seed", label: "Variety", kind: "int", min: 0, max: 99, def: 0, hint: "Changes the prizes in a claw machine and which show plays." },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "In front of Scout"]], def: "back" }] },
        vine: { cat: "Arcade", label: "Hanging vine", hint: "A vine hanging from where it is put, swaying a little. Only to look at: the Rope tool makes vines to climb in the arcade.", fields: [
            { key: "h", label: "Length", kind: "int", min: 8, max: 400, def: 48, unit: "px" },
            { key: "leaves", label: "Leaves", kind: "range", min: 0, max: 1, step: 0.05, def: 0.6 },
            { key: "flowers", label: "Glowing flowers", kind: "bool" },
            { key: "sway", label: "Sways", kind: "bool", def: true },
            { key: "seed", label: "Shape", kind: "int", min: 0, max: 99 },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "In front of Scout"]], def: "back" }] },
        neon: { cat: "Arcade", label: "Neon sign", hint: "A shape or words in neon tube, glowing; set it to buzz now and then, or put it out.", fields: [
            { key: "kind", label: "Shape", kind: "select", options: [["star", "Star"], ["bolt", "Lightning bolt"], ["heart", "Heart"], ["arrow", "Arrow"], ["palm", "Palm tree"], ["ring", "Rings"], ["wave", "Wave"], ["cherries", "Cherries"], ["ghost", "Ghost"], ["joystick", "Joystick"], ["planet", "Planet"], ["note", "Music note"], ["text", "Words"]], def: "star" },
            { key: "text", label: "Words", kind: "text", placeholder: "OPEN", when: o => o.kind === "text" },
            { key: "color", label: "Colour", kind: "color", def: "#ff3ea8" },
            { key: "scale", label: "Size", kind: "int", min: 1, max: 4, def: 1 },
            { key: "on", label: "Lit", kind: "bool", def: true },
            { key: "flicker", label: "Buzz", kind: "range", min: 0, max: 1, step: 0.05, def: 0 },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "In front of Scout"]], def: "back" }] },
        drip: { cat: "Mechanics", label: "Water drip", grid: true, hint: "Water dripping from the roof now and then: only to look at. Put it in the tile under the roof.", fields: [
            { key: "every", label: "Drips every", kind: "int", min: 30, max: 1200, def: 110, unit: "frames" }] },
        pour: { cat: "Mechanics", label: "Pour", grid: true, hint: "A stream from the roof, sand in the Tomb, water elsewhere: only to look at." },
        // LIGHTS
        torch: { cat: "Lights", label: "Lantern", sprite: "torchBase", fields: [
            { key: "style", label: "Style", kind: "select", options: [["wall", "The zone's own (on the wall)"], ["hang", "Hanging on a chain"], ["oil", "Oil lamp on the wall"], ["floor", "Standing on the floor"], ["candle", "Candle"], ["candleStub", "Candle stub"], ["candles", "Three candles"], ["candlestick", "Candlestick"], ["candelabra", "Candelabra"], ["sconce", "Candle sconce (wall)"], ["skullCandle", "Candle on a skull"], ["bottleCandle", "Candle in a bottle"], ["candleHang", "Hanging candle"], ["chandelier", "Chandelier"], ["fireflies", "Jar of fireflies"]], def: "wall", hint: "A hanging one's chain runs up to the roof above it; one on the floor stands on the floor of its tile." },
            { key: "lamp", label: "Show the lamp", kind: "bool", def: true }, { key: "color", label: "Colour", kind: "color", placeholder: "zone's" },
            { key: "radius", label: "Glow radius", kind: "int", min: 0, max: 400, def: 70, unit: "px" }, { key: "intensity", label: "Brightness", kind: "range", min: 0, max: 1, step: 0.01, def: 0.3 },
            { key: "reveal", label: "Lights the dark", kind: "int", min: 0, max: 400, def: 86, unit: "px", hint: "How far it opens the darkness in a dark passage." },
            { key: "flicker", label: "Flicker", kind: "range", min: 0, max: 0.4, step: 0.01, def: 0.06 },
            { key: "embers", label: "Embers", kind: "tri" }, { key: "soot", label: "Soot on the wall", kind: "tri" }] },
        // (17 Oct 2026) a part of a passage as dark as the Depths
        darkzone: { cat: "Lights", label: "Dark area (box)", sizable: true, hint: "Makes this box of the passage dark, as the Depths are: only Scout's own light, lanterns, lights and the like light it. Its edges fade where it opens onto open air, so the dark comes on as he walks in; against rock it stays dark right up to the wall. Press L to preview.", fields: [
            { key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Height", kind: "int", min: 16, step: 16, unit: "px" },
            { key: "fade", label: "Soft edge", kind: "int", min: 0, max: 160, def: 32, unit: "px" },
            { key: "alpha", label: "Darkness", kind: "range", min: 0.3, max: 1, step: 0.005, def: 0.965 },
            { key: "color", label: "Colour of the dark", kind: "color", def: "#030207" }] },
        light: { cat: "Lights", label: "Light", fields: [
            { key: "kind", label: "Kind", kind: "select", options: [["point", "Glow"], ["spot", "Spotlight"], ["shaft", "Light shaft"], ["beacon", "Beacon"]], def: "point" },
            { key: "color", label: "Colour", kind: "color", def: "#ffb050" },
            { key: "radius", label: "Radius", kind: "int", min: 0, max: 600, def: 80, unit: "px", when: o => o.kind !== "shaft" },
            { key: "intensity", label: "Brightness", kind: "range", min: 0, max: 1, step: 0.01, def: 0.3 },
            { key: "angle", label: "Points", kind: "int", min: 0, max: 359, def: 90, unit: "°", when: o => o.kind === "spot" || o.kind === "shaft", hint: "90 is straight down." },
            { key: "spread", label: "Spread", kind: "int", min: 5, max: 180, def: 40, unit: "°", when: o => o.kind === "spot" },
            { key: "w", label: "Beam width", kind: "int", min: 2, max: 200, def: 24, unit: "px", when: o => o.kind === "shaft" },
            { key: "h", label: "Beam length", kind: "int", min: 8, max: 600, def: 120, unit: "px", when: o => o.kind === "shaft" },
            { key: "flicker", label: "Flicker", kind: "range", min: 0, max: 0.4, step: 0.01, def: 0 },
            { key: "pulse", label: "Breathes every", kind: "int", min: 0, max: 600, def: 0, unit: "frames", hint: "0: steady." },
            { key: "reveal", label: "Lights the dark", kind: "int", min: 0, max: 400, def: 0, unit: "px" },
            { key: "scare", label: "Wisps keep out", kind: "bool", def: true, when: o => o.reveal > 0 },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "Over Scout"]], def: "back", when: o => o.kind !== "beacon" }] },
        // SCENERY
        // (17 Oct 2026) a platform crane, broken: only to look at
        /* (21 Oct 2026, the owner's: "some sort of waterfall type scenery item, to help give some of the water context
           for as to how/why it's there") js/rat-race.js, A WATERFALL */
        waterfall: { cat: "Scenery", label: "Waterfall", hint: "Water falling or dripping, only to look at, Scout passes behind it. Put its top where the water comes from (the pipe at the rock face, the ledge's lip, the trough's mouth, the top of the seep, the roof for drips) and drag its bottom edge to the pool's surface (or the floor); drag its right edge to widen a curtain, a seep or a row of drips.", fields: [
            { key: "kind", label: "Kind", kind: "select", options: [["spout", "Spout from an old drain pipe"], ["curtain", "Curtain off a ledge"], ["flume", "Flume (an old trough)"], ["seep", "Seep down the rock"], ["drips", "Slow drips from the roof"], ["trickle", "Trickle from the roof"]], def: "curtain" },
            { key: "water", label: "Water", kind: "select", options: [["clear", "Clear"], ["murk", "Murky green"]], def: "clear" },
            { key: "h", label: "Length (to the pool)", kind: "int", min: 16, max: 1600, def: 96, unit: "px" },
            { key: "w", label: "Width", kind: "int", min: 4, max: 256, def: 12, unit: "px", when: o => ["curtain", "seep", "drips"].includes(o.kind || "curtain") },
            { key: "thick", label: "Stream thickness", kind: "int", min: 2, max: 12, def: 4, unit: "px", when: o => o.kind === "spout" || o.kind === "flume" },
            { key: "flip", label: "Mirrored (falls to the left)", kind: "bool" },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "In front of Scout"]], def: "back" }] },
        wreck: { cat: "Scenery", label: "Broken crane", hint: "A platform crane broken and left (an across platform's runway and trolley, or an up-and-down platform's headframe, sheave and winch): only to look at, Scout passes behind it. Put it by the top of its beam; it hangs from the roof above, or stands on posts in the open, as the working ones do, in the zone's own materials.", fields: [
            { key: "rig", label: "Kind", kind: "select", options: [["across", "Across (runway and trolley)"], ["updown", "Up and down (headframe and winch)"]], def: "across" },
            { key: "kind", label: "State", kind: "select", options: [["worn", "Slightly damaged"], ["ruin", "Falling apart"], ["swing", "Deck broken, swinging"]], def: "worn" },
            { key: "w", label: "Beam length", kind: "int", min: 48, max: 400, def: 112, unit: "px" },
            { key: "flip", label: "Mirrored", kind: "bool" },
            { key: "seed", label: "Variety", kind: "int", min: 0, max: 99, def: 0 },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "In front of Scout"]], def: "back" }] },
        prop: { cat: "Scenery", label: "Prop", fields: [
            { key: "s", label: "Picture", kind: "sprite" }, { key: "frame", label: "Frame", kind: "int", min: 0, max: 7, def: 0, when: o => frames(o.s) > 1 },
            { key: "flip", label: "Mirrored", kind: "bool" },
            { key: "layer", label: "Layer", kind: "select", options: [["back", "Behind Scout"], ["front", "In front of Scout"]], def: "back" },
            { key: "solid", label: "Collision", kind: "select", options: [["none", "None (scenery)"], ["solid", "Solid obstacle"], ["top", "Stand on top only"]], def: "none" },
            { key: "hit", label: "Hitbox", kind: "hitbox", when: o => o.solid === "solid" || o.solid === "top" },
            { key: "tone", label: "Tone", kind: "tone" }] },
        upright: { cat: "Timber", label: "Frame upright", hint: "The zone's frame: a post, pole, pillar, girder or column standing behind.", fields: [{ key: "h", label: "Height", kind: "int", min: 8, unit: "px" }, { key: "braces", label: "Braced to rails", kind: "bool", def: true }] },
        crossbeam: { cat: "Timber", label: "Frame rail", hint: "A rail or pole across the frame's uprights.", fields: [{ key: "w", label: "Width", kind: "int", min: 8, unit: "px" }] },
        root: { cat: "Timber", label: "Hanging root", fields: [{ key: "h", label: "Length", kind: "int", min: 8, unit: "px" }, { key: "seed", label: "Shape", kind: "int" }] },
        post: { cat: "Timber", label: "Support post", fields: [{ key: "h", label: "Height", kind: "int", min: 4, unit: "px" }, { key: "knees", label: "Knee braces", kind: "bool" }, { key: "foot", label: "Footing", kind: "bool" }] },
        brace: { cat: "Timber", label: "Brace", fields: [{ key: "len", label: "Length", kind: "int", min: 2, max: 200, unit: "px" }, { key: "dir", label: "Leans", kind: "select", options: [[1, "Down to the right"], [-1, "Down to the left"]], def: 1 }] },
        cleat: { cat: "Timber", label: "Wall cleat", fields: [{ key: "side", label: "Wall on the", kind: "select", options: [["L", "Left"], ["R", "Right"]], def: "L" }] },
        chain: { cat: "Timber", label: "Chain", fields: [{ key: "h", label: "Length", kind: "int", min: 3, unit: "px" }] },
        hangrope: { cat: "Timber", label: "Hanging rope", fields: [{ key: "h", label: "Length", kind: "int", min: 3, unit: "px" }] },
        ycap: { cat: "Timber", label: "Post cap" },
        // (21 Oct 2026) a box the game props up by itself: js/rat-race.js, SUPPORT AREAS
        supportarea: { cat: "Timber", label: "Support area (box)", sizable: true, hint: "Inside this box, the game props up every wall whose underside is over open air with timber sets (a cap beam, a post at each end, knee braces), and gives any platform with nothing holding it posts, braces or chains. Worked out afresh as you edit, so it follows the walls; where you have placed supports yourself it adds none.", fields: [
            { key: "w", label: "Width", kind: "int", min: 16, step: 16, unit: "px" }, { key: "h", label: "Height", kind: "int", min: 16, step: 16, unit: "px" }] },
        shaftbeam: { cat: "Timber", label: "Shaft beam", fields: [{ key: "w", label: "Width", kind: "int", min: 8, unit: "px" }] }
    };
    // what each new one starts as
    const NEW = {
        coin: {}, gem: {}, life: {}, key: {}, dynamite: {}, knife: {}, exit: {}, doorway: { id: "A", to: "B" }, blast: {}, hatch: {}, pump: {},
        rat: {}, bat: {}, spider: {}, beetle: {}, lizard: {}, hare: {}, crawler: {}, grub: {}, wisp: {}, bot: {}, jelly: {}, hammer: {}, steam: {},
        start: {}, flag: {}, sign: { text: "" }, crate: {}, float: {}, icicle: {}, falls: {}, brazier: {}, alarm: {}, tank: {}, vent: {},
        swing: { kind: "rope", len: 72 }, zipline: { dx: 160, dy: 48 }, scree: { w: 64, h: 64, dir: 1 }, quicksand: { w: 64, h: 32 }, minecart: { dir: 1, speed: 2.4 }, rails: { w: 64 },
        pool: { name: "A", w: 64, h: 48, drop: 48 }, sluice: { pool: "A" }, torchbracket: {}, firegate: { group: "A" }, mummy: {}, snake: {},
        mover: { axis: "h", min: -48, max: 48 }, current: { w: 64, h: 32, dx: 1, dy: 0 }, darkzone: { w: 160, h: 112 },
        switch: { kind: "beatA" }, piston: {}, lava: { w: 64, h: 32 }, spout: {}, conveyor: { w: 64, dx: 1 }, hourglass: {}, pour: {}, gear: { r: 40 }, bumper: {}, spring: {}, machine: { kind: "cab" }, wreck: { kind: "worn", w: 112 }, waterfall: { kind: "curtain", water: "clear", h: 96, w: 12 }, vine: { h: 48 }, neon: { kind: "star" }, burner: { dir: "up" }, ooze: { len: 12 }, drip: {},
        torch: {}, light: { kind: "point", color: "#ffb050", radius: 80, intensity: 0.3 },
        prop: { s: "barrel", layer: "back" },
        upright: { h: 224, braces: true }, crossbeam: { w: 320 }, root: { h: 120 },
        post: { h: 48, foot: true }, brace: { len: 12, dir: 1 }, cleat: { side: "L" }, chain: { h: 48 }, hangrope: { h: 48 }, ycap: {}, shaftbeam: { w: 32 }, supportarea: { w: 160, h: 112 }
    };
    // Library entries that are a ready-made variant of a type
    const PRESETS = [
        { type: "swing", label: "Swinging chandelier", over: { kind: "chandelier", len: 40 } },
        { type: "mover", label: "Platform: across", over: { axis: "h" } },
        { type: "mover", label: "Platform: up and down", over: { axis: "v" } },
        { type: "mover", label: "Platform: on a path", over: { axis: "path", path: [] } },
        { type: "waterfall", label: "Waterfall: pipe", over: { kind: "spout", water: "clear", thick: 4 } },
        { type: "waterfall", label: "Waterfall: curtain", over: { kind: "curtain", water: "clear", w: 12 } },
        { type: "waterfall", label: "Waterfall: flume", over: { kind: "flume", water: "clear", thick: 5 } },
        { type: "waterfall", label: "Waterfall: seep", over: { kind: "seep", water: "clear", w: 10 } },
        { type: "waterfall", label: "Drips", over: { kind: "drips", water: "clear", w: 32, h: 64 } },
        { type: "waterfall", label: "Trickle", over: { kind: "trickle", water: "clear", h: 64 } },
        { type: "waterfall", label: "Murky waterfall: pipe", over: { kind: "spout", water: "murk", thick: 4 } },
        { type: "waterfall", label: "Murky waterfall: curtain", over: { kind: "curtain", water: "murk", w: 12 } },
        { type: "waterfall", label: "Murky waterfall: flume", over: { kind: "flume", water: "murk", thick: 5 } },
        { type: "waterfall", label: "Murky waterfall: seep", over: { kind: "seep", water: "murk", w: 10 } },
        { type: "waterfall", label: "Murky drips", over: { kind: "drips", water: "murk", w: 32, h: 64 } },
        { type: "waterfall", label: "Murky trickle", over: { kind: "trickle", water: "murk", h: 64 } },
        { type: "wreck", label: "Broken crane: damaged", over: { kind: "worn" } },
        { type: "wreck", label: "Broken crane: falling apart", over: { kind: "ruin" } },
        { type: "wreck", label: "Broken crane: deck swinging", over: { kind: "swing" } },
        { type: "wreck", label: "Broken lift crane: damaged", over: { rig: "updown", kind: "worn", w: 72 } },
        { type: "wreck", label: "Broken lift crane: falling apart", over: { rig: "updown", kind: "ruin", w: 72 } },
        { type: "wreck", label: "Broken lift crane: deck swinging", over: { rig: "updown", kind: "swing", w: 72 } },
        { type: "current", label: "Current right", over: { dx: 1, dy: 0 } }, { type: "current", label: "Current left", over: { dx: -1, dy: 0 } },
        { type: "current", label: "Current up", over: { dx: 0, dy: -1 } }, { type: "current", label: "Current down", over: { dx: 0, dy: 1 } },
        { type: "torch", label: "Hanging lantern", over: { style: "hang" } },
        { type: "torch", label: "Oil lamp", over: { style: "oil" } },
        { type: "torch", label: "Floor lantern", over: { style: "floor" } },
        // (22 Oct 2026) candles, and a jar of fireflies: a lantern's styles, softer and nearer by default
        { type: "torch", label: "Candle", over: { style: "candle", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Candle stub", over: { style: "candleStub", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Three candles", over: { style: "candles", radius: 60, intensity: 0.26, reveal: 76, flicker: 0.1 } },
        { type: "torch", label: "Candlestick", over: { style: "candlestick", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Candelabra", over: { style: "candelabra", radius: 68, intensity: 0.27, reveal: 84, flicker: 0.1 } },
        { type: "torch", label: "Candle sconce", over: { style: "sconce", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Candle on a skull", over: { style: "skullCandle", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Candle in a bottle", over: { style: "bottleCandle", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Hanging candle", over: { style: "candleHang", radius: 48, intensity: 0.22, reveal: 64, flicker: 0.1 } },
        { type: "torch", label: "Chandelier", over: { style: "chandelier", radius: 84, intensity: 0.3, reveal: 100, flicker: 0.1 } },
        { type: "torch", label: "Jar of fireflies", over: { style: "fireflies", radius: 40, intensity: 0.16, reveal: 52, flicker: 0, color: "#c8f070" } },
        { type: "light", label: "Glow", over: { kind: "point" } },
        { type: "light", label: "Spotlight", over: { kind: "spot", angle: 90, spread: 40, radius: 140, intensity: 0.28, color: "#ffe2a8" } },
        { type: "light", label: "Light shaft", over: { kind: "shaft", angle: 90, w: 28, h: 160, intensity: 0.18, color: "#fff2c8" } },
        { type: "light", label: "Beacon", over: { kind: "beacon", color: "#ff281e", radius: 70, intensity: 0.28, reveal: 46 } },
        { type: "light", label: "Dark glow (no light)", over: { kind: "point", radius: 0, intensity: 0, reveal: 30, scare: false, color: "#8ef0b0" }, hint: "Opens the darkness without lighting the wall, as the Depths' toadstools do." }
    ];
    // Pictures offered as props, the zone's own first (see the library)
    const PROP_SPRITES = ["barrel", "crate", "rubble", "rock", "web", "banner", "relief", "pile", "pileTop", "planks",
        "qblock@quarry", "qpile@quarry", "qpick@quarry", "qshovel@quarry", "qsledge@quarry", "crate@quarry", "rubble@quarry", "rock@quarry",
        "idrift@ice", "ibarrel@ice", "icrystal@ice", "crate@ice", "rubble@ice", "rock@ice",
        "dbones@dark", "durn@dark", "dshroom@dark", "crate@dark", "rubble@dark", "rock@dark",
        "sdrum@station", "shose@station", "crate@station", "rubble@station", "rock@station", "relief@station", "tank@station",
        "hgold@heart", "hurn@heart", "rubble@heart",
        // (14 Oct 2026) the arcade's, and the jungle grown into it
        "arcadeCab", "arcadeCabDead", "arcadePinball", "arcadeClaw", "arcadeTV", "arcadeTickets", "arcadeTube", "jungleFern", "jungleMonstera", "jungleCreeper",
        // (14 Oct 2026) the scenery for any zone
        "crateSmall", "crateX", "crateIron", "crateLong", "crateStack", "crateOpen", "crateBroken", "barrelTall", "keg", "barrelSide", "barrelBroken", "bucket", "sack", "sacks", "sackSpilt", "ropeCoil", "plankPile", "chainHeap", "pebbles", "rubbleSmall", "rubbleWide", "rubbleHeap", "boulder", "slab", "weeds", "weedsTall", "weedsLow", "weedsSparse", "grassStrip", "fern", "flowers", "ivy", "mossStone", "branch", "pot", "amphora", "potBroken", "skull", "candles", "chest", "signpost", "signTwoWay", "signCrooked", "signLeaning", "signSnapped", "signPlankUp", "signExit", "dangerStop", "dangerDanger", "dangerKeepOut", "dangerNoEntry", "dangerBeware", "dangerTurnBack", "dangerSkull", "dangerTriangle", "dangerCaveIn", "dangerShaft", "cart", "cartOre", "cartLame", "cartUpturned", "cartSide", "cartWreck", "cartWheel", "stalagmite", "puddle", "columnBroken", "statueHead", "cog", "cogPair", "spring", "urnGold", "canopic", "sandHeap", "ingots", "anvil", "coal", "leaves"];
    // what each picture is called (by its name before the @; a zone's own version gets the zone's name after)
    const PROP_NAMES = {
        arcadeCab: "Arcade cabinet", arcadeCabDead: "Arcade cabinet, dead", arcadePinball: "Pinball table", arcadeClaw: "Claw machine", arcadeTV: "Old television", arcadeTickets: "Prize tickets", arcadeTube: "Broken neon tube", jungleFern: "Fern", jungleMonstera: "Monstera", jungleCreeper: "Creeper heap",
        barrel: "Barrel", crate: "Crate", rubble: "Rubble", rock: "Rock", web: "Cobweb", banner: "Banner", relief: "Carved relief", pile: "Rubble heap", pileTop: "Rubble top", planks: "Planks",
        qblock: "Cut block", qpile: "Stone pile", qpick: "Pickaxe", qshovel: "Shovel", qsledge: "Sledgehammer",
        idrift: "Snowdrift", ibarrel: "Frozen barrel", icrystal: "Ice crystals",
        dbones: "Bones", durn: "Broken urn", dshroom: "Toadstools",
        sdrum: "Oil drum", shose: "Coiled hose", tank: "Oxygen tank", hgold: "Heap of gold", hurn: "Golden urn",
        crateSmall: "Small crate", crateX: "Crate, cross-braced", crateIron: "Crate, iron-cornered", crateLong: "Long crate", crateStack: "Stacked crates", crateOpen: "Open crate of straw", crateBroken: "Broken crate", barrelTall: "Tall barrel", keg: "Keg", barrelSide: "Barrel on its side", barrelBroken: "Broken barrel", bucket: "Bucket", sack: "Sack", sacks: "Pair of sacks", sackSpilt: "Spilt sack", ropeCoil: "Coil of rope", plankPile: "Pile of planks", chainHeap: "Heap of chain", pebbles: "Pebbles", rubbleSmall: "Small rubble", rubbleWide: "Wide rubble", rubbleHeap: "Rubble heap", boulder: "Boulder", slab: "Cracked slab", weeds: "Weeds", weedsTall: "Tall weeds", weedsLow: "Low weeds", weedsSparse: "Sparse weeds", grassStrip: "Grass along the floor", fern: "Fern", flowers: "Flowers", ivy: "Hanging ivy", mossStone: "Mossy stone", branch: "Dead branch", pot: "Clay pot", amphora: "Amphora", potBroken: "Broken pot", skull: "Skull", candles: "Candles", chest: "Chest", signpost: "Signpost", signTwoWay: "Signpost, two ways", signCrooked: "Signpost, hung crooked", signLeaning: "Signpost, leaning", signSnapped: "Signpost, snapped", signPlankUp: "Arrow plank, up", signExit: "Exit board",
        dangerStop: "Danger: STOP!", dangerDanger: "Danger: DANGER", dangerKeepOut: "Danger: KEEP OUT", dangerNoEntry: "Danger: no entry", dangerBeware: "Danger: BEWARE", dangerTurnBack: "Danger: TURN BACK", dangerSkull: "Danger: skull and bones", dangerTriangle: "Danger: warning triangle", dangerCaveIn: "Danger: CAVE IN", dangerShaft: "Danger: SHAFT", cart: "Mine cart", cartOre: "Mine cart, full of ore", cartLame: "Mine cart, lost a wheel", cartUpturned: "Mine cart, upturned", cartSide: "Mine cart, on its side", cartWreck: "Mine cart, wrecked", cartWheel: "Cart wheel", stalagmite: "Stalagmite", puddle: "Puddle", columnBroken: "Broken column", statueHead: "Fallen statue head", cog: "Cog", cogPair: "Pair of cogs", spring: "Spring", urnGold: "Gilded urn", canopic: "Canopic jar", sandHeap: "Heap of sand", ingots: "Stack of ingots", anvil: "Anvil", coal: "Heap of coal", leaves: "Fallen leaves"
    };
    const ZONE_NAMES = { quarry: "Quarry", ice: "Ice", dark: "Depths", station: "Station", heart: "Heart", clock: "Vault", tomb: "Tomb", foundry: "Foundry", ruins: "Ruins", factory: "Steamworks", arcade: "Arcade" };
    const CATS = ["Terrain", "Pickups", "Doors", "Creatures", "Mechanics", "Lights", "Arcade", "Scenery", "Timber"];

    let framesOf = () => 1;
    const frames = s => framesOf(s);

    window.AE = window.AE || {};
    Object.assign(window.AE, { CATALOG: { TERRAIN, TILE_NAMES, TYPES, NEW, PRESETS, PROP_SPRITES, PROP_NAMES, ZONE_NAMES, CATS, setFramesOf: fn => { framesOf = fn; } } });
})();
