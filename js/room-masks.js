/* Hand-painted walkable grids for the painted rooms.

   THIS FILE IS WRITTEN BY HAND — or rather, by the Walkable mode in the level
   editor, which paints one of these and hands you the text to drop in here.
   It is the one part of a public room that is not read out of the client,
   because the client does not have it: Habbo's server sent a room's walkable
   map at runtime and only the artwork ever shipped.

   tools/public-room-extract.js makes a first guess by sampling each tile's
   pixels — grey stone and red carpet are floor, everything else is not — and
   that guess is good enough to walk on and wrong in the places a guess always
   is. It cannot tell floor in shadow from the thing casting the shadow, it has
   no opinion about whether a rug should be walkable, and it will not know that
   the tile under the arch is reachable but the one behind the plant is not.

   Anything in here REPLACES the derived mask outright for that room. An entry
   whose size does not match the room is ignored with a warning rather than
   half-applied, because a mask that is off by one row is worse than no mask:
   every tile after the mistake means a different place.

   FORMAT. One string per row, "0" for floor and "x" for not, exactly the grid
   the extractor emits and exactly what the editor's "Copy the grid" button
   puts on your clipboard — so the quickest way to write one is to paint it and
   paste it, rather than to type it out.

       window.RoomMasks = {
           library: [
               "xxxxxxxxxxxxxxxxxxxxxxxxxx",
               ...
           ]
       };
*/
(function () {
    "use strict";

    window.RoomMasks = {
        /* Nothing overridden yet — the Library is running on the grid guessed
           from its artwork. Paint one in the editor (Walkable) and paste it
           here. */
    };
})();
