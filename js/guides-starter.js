/* ===========================================================
   Maze Rats — the starter guide

   "Maze fundamentals", written from the sticky notes in markeh's Tutorial
   Maze and turned from directions for those rooms into the general tricks
   they teach. Each section's picture is the tutorial room that shows it.

   This is NOT what the site reads. Guides live in the database (see
   netlify/functions/guides.js) so they can be edited in /warren; this file
   is only the first one, offered by the Guides panel's "Add the starter
   guide" button when it is missing. Once added, edit it there — changing
   it here changes nothing that is already published.

   The pictures ship with the site under assets/img/guides/, which is one
   of the two places a guide picture may come from (the other being an
   upload from the panel).
   =========================================================== */
window.GUIDES_STARTER = (function () {
    const img = name => `/assets/img/guides/maze-fundamentals/${name}.png`;

    return {
        id: "maze-fundamentals",
        title: "Maze Fundamentals",
        category: "Getting Started",
        status: "published",
        order: 0,
        // No thumbnail of its own: the pages fall back to the first section
        // picture (the corner-plinth room). Upload one in /warren to change it.
        thumb: "",
        summary: "The tricks almost every furni maze is built from: hidden seats, stacked furni, tricky clicks, height limits, hidden teleporters, one-way gates and jump tiles. Each trick is shown in its room from markeh's Tutorial Maze.",
        sections: [
            /* The picture on each section is the tutorial room whose note it
               was written from: room 1 for "Stacked furni" through room 13 for
               "Jump tiles". The first and last sections come from the maze's
               entrance and finish notes, which have no room picture. */
            {
                heading: "How a furni maze works",
                body: [
                    "In a furni maze you don't get through a room by walking across it. You get through by moving from one piece of furni to the next: sitting, lying, standing on it, or being carried by it. Most mazes start at a teleporter and end at another, with every room a small puzzle about which piece to click next.",
                    "The first thing to learn is that **a seat you can't see is often still there**. Builders hide stools and chairs inside or behind other furni, most often plants. Click where the seat is hiding and your avatar will sit on it, even though the plant is in the way.",
                    "> Stuck in a room? Hover slowly over everything near you. If your pointer changes or a floor tile lights up, there's something there to use."
                ].join("\n\n")
            },
            {
                heading: "Stacked furni",
                image: img("01-stacked-plinths"),
                body: [
                    "Furni can be placed inside other furni, so two or three items share the same spot. When that happens you can click **into** the stack and land on the one hidden inside, rather than the one on the outside.",
                    "In the Tutorial Maze this is done with corner plinths, and it's easy to see. In a real maze it rarely is: a stacked seat usually looks like part of the furni around it, and the only clue is that clicking there does something."
                ].join("\n\n")
            },
            {
                heading: "Furni that won't take a click",
                image: img("02-presents-on-plinths"),
                body: [
                    "Some furni can't be clicked *through* at all, because clicking it does something else. This is mostly anything interactive:",
                    "- minibars\n- gates\n- presents\n- trophies\n- teleporters",
                    "Clicking one of these on its own won't move you. Look for another piece of furni sharing the same spot and click that instead. In the room pictured, clicking a present does nothing, but clicking the top of the corner plinth it shares a spot with moves you straight there."
                ].join("\n\n")
            },
            {
                heading: "Look for the yellow tile",
                image: img("03-fireplace-yellow-tile"),
                body: [
                    "A lot of maze solving is simply finding the right place to click. Large or animated furni such as fireplaces can't be clicked through, so the seat behind one seems unreachable.",
                    "Hover your pointer over the spot you want to reach instead. When you're over a place you can move to, **the floor tile lights up with a yellow border**. Click there and your avatar goes to it, even if a fireplace is in the way.",
                    "> The tutorial raises its pods so they're easy to spot. In a real maze the seat may sit flat and be almost completely hidden, so the yellow tile is often your only clue."
                ].join("\n\n")
            },
            {
                heading: "Rolling into a bed",
                image: img("04-rollers-into-bed"),
                body: [
                    "Rollers can push your avatar into places you couldn't walk to, and a bed is a common one. When a roller is lined up with any part of a bed, riding it rolls you **into** the bed.",
                    "Once you're inside, click any part of the bed to lie down in it properly. Try clicking the bottom of it.",
                    "Watch where you land, though: roll into the foot of a bed and you can't move further up it, but you can still move out again."
                ].join("\n\n")
            },
            {
                heading: "Furni that walks you to it",
                image: img("05-path-finding-furni"),
                body: [
                    "Some furni pulls your avatar towards it when clicked: your avatar path-finds to the nearest spot it can use. Fridges, bars, toilets and teleporters all do this.",
                    "That makes them useful stepping stones. Where a fireplace blocks your path, a fridge beside it may be what gets you past, because clicking the fridge walks you right up to it.",
                    "The same goes for teleporters: **double-click a teleporter** and your avatar walks to it, so you don't have to find a clear path yourself.",
                    "Real mazes rarely use one trick per room. Expect to combine them: a yellow-tile click to reach one seat, then a fridge to get past the next blockage."
                ].join("\n\n")
            },
            {
                heading: "Height and the four-shelf rule",
                image: img("06-height-pods"),
                body: [
                    "Height matters. **You can only move to furni within four stacking levels of where you are now.** Builders use the z shelf as a unit of height, so think of it as four shelves up or down.",
                    "A seat that's too high to reach from the floor may be easy to reach from a seat that's already partway up. If you can't get onto something, look for a stepping stone at a height in between, and climb in stages."
                ].join("\n\n")
            },
            {
                heading: "Putting it together",
                image: img("07-merged-furni"),
                body: [
                    "Once you know the basics, mazes start merging furni together so the tricks overlap. You can sit into z shelves that are stacked with other furni, and a corner seat might only be reachable by hovering around a minibar or sink until the yellow tile appears.",
                    "When a room looks impossible, go back through the list: is anything stacked? Is anything blocking the click? Which spots light up yellow? Is the next seat too high?"
                ].join("\n\n")
            },
            {
                heading: "Baths and toilets",
                image: img("08-bath-and-toilet"),
                body: [
                    "Bathroom furni has its own behaviour:",
                    "- Clicking a **bath** walks you to its northernmost part, the end furthest up the room. To use the rest of it, click underneath the bath instead.\n- Clicking a **toilet** moves you straight onto it, much like a fridge or teleporter pulls you in.",
                    "Both can take you somewhere you couldn't walk to, so they're worth trying whenever one appears in a room."
                ].join("\n\n")
            },
            {
                heading: "Floating furni and diagonal moves",
                image: img("09-floating-doormats"),
                body: [
                    "Walkable furni such as doormats can be stacked high up in the air. You **can't walk onto walkable furni if it's too high above you**, but that height can still block a route, and it can steer you.",
                    "Remember that avatars can move diagonally. You can often step from pod to pod on a diagonal, slipping between the tiles a floating mat has blocked.",
                    "> In the tutorial the mats are easy to see. Real mazes usually hide them, so if a straight move refuses to work, try the diagonal."
                ].join("\n\n")
            },
            {
                heading: "Hidden teleporters",
                image: img("10-hidden-teleporters"),
                body: [
                    "A teleporter isn't always used by clicking where you'd expect. Sometimes clicking the top of one does nothing, but **clicking its bottom-right edge** takes you through.",
                    "Builders also hide teleporters behind other furni. A vase of flowers in front of one can cover almost all of it, yet the same bottom-right click still works if you can find the edge.",
                    "Teleporters can be hidden in all sorts of ways, and the ones in real mazes are usually much crueller than the tutorial's. Inspect every teleporter you find, from every side."
                ].join("\n\n")
            },
            {
                heading: "One-way gates",
                image: img("11-one-way-gates"),
                body: [
                    "One-way gates are a sneaky way to hide a click. A gate can sit behind other furni and still be clicked, as long as part of it shows: through an open door, for example.",
                    "When the door in front is closed, look around its edges. A sliver of the gate showing at the side is enough to click.",
                    "The catch: **you have to be standing in front of a one-way gate to use it**. Move up so you're in front of it first, then click."
                ].join("\n\n")
            },
            {
                heading: "Quick clicks",
                image: img("12-quick-clicks"),
                body: [
                    "One-way gates can also be turned into **quick clicks**. The idea is to step off to the side the instant you come through a gate, before the rollers beyond it carry you away.",
                    "1. Double-click the one-way gate.\n2. As soon as you're through, click the chair beside you.",
                    "If you end up on the rollers you were too slow; go back round and try again. Some builders make these much tighter than the tutorial does, so getting the timing right takes practice."
                ].join("\n\n")
            },
            {
                heading: "Jump tiles",
                image: img("13-jump-tiles"),
                body: [
                    "Jump tiles push your avatar **up to five spaces ahead**. Use them to get over furni, and into places you couldn't normally reach.",
                    "When several jump tiles are lined up, you follow all of them in one go, and they can even carry you over chairs."
                ].join("\n\n")
            },
            {
                heading: "Now try one",
                body: [
                    "Those are the fundamentals of furni mazes. Every maze in the archive is built from some mix of them, usually disguised much better than in the tutorial.",
                    "- Walk through them in order in the [Tutorial Maze](maze:tutorial-maze) by markeh, which these notes come from. It's still open on the COM hotel.\n- Then pick an **Easy** maze from the archive and put them to use.",
                    "And when you reach the end of a maze, treat yourself to a coffee from the mochamaster. It's tradition."
                ].join("\n\n")
            }
        ]
    };
})();
