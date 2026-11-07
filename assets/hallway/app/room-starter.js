/* The maze rooms as they come: three furnished layouts for each room size. map.rooms replaces these as soon as a layout is
   edited. Every room keeps the middle of both near edges clear, since that's where you come in and go back out. */
(function () {
    "use strict";
    const shelfY = (x, y, n) => ({ k: "shelf", axis: "y", x, y, n });
    const shelfX = (x, y, n) => ({ k: "shelf", axis: "x", x, y, n });
    const album = (x, y) => ({ k: "album", x, y });
    const ledger = (x, y) => ({ k: "ledger", x, y });
    const thing = (k, x, y) => ({ k, x, y });
    const lamp = (x, y) => ({ k: "lamp", x, y });
    const rug = (x, y, w, h) => ({ k: "rug", x, y, w, h });
    const round = (x, y) => ({ k: "rugRound", x, y });
    const pic = (wall, at, up, w, h, slot) => ({ k: "frame", wall, at, up, w, h, slot });
    const S = {
        "9x8": [
            { floor: "slate", items: [rug(0, 5, 9, 3), pic("r", 1.7, 56, 30, 22, 0), pic("r", 4.5, 56, 30, 22, 1), shelfY(0, 0, 5), shelfY(3, 0, 5), shelfY(6, 0, 5), ledger(7, 1), album(1, 6), album(5, 6), lamp(8, 7)] },
            { floor: "wood", items: [round(4, 3), pic("r", 1.6, 34, 34, 26, 0), pic("r", 4.2, 34, 34, 26, 1), pic("r", 6.8, 34, 34, 26, 2), shelfY(0, 0, 8), ledger(3, 2), album(6, 5), thing("globe", 7, 1), thing("chair6", 5, 3), lamp(1, 7), lamp(8, 7)] },
            { floor: "slate", items: [rug(2, 2, 6, 3), pic("l", 2.2, 38, 34, 26, 0), pic("l", 5, 38, 34, 26, 1), shelfX(1, 0, 8), ledger(3, 2), thing("chair6", 5, 2), album(1, 5), album(6, 5), thing("candelabra", 8, 7), lamp(0, 7)] }
        ],
        "10x9": [
            { floor: "wood", items: [rug(2, 2, 6, 4), pic("r", 2.6, 14, 54, 40, 0), shelfX(5, 0, 5), thing("globe", 1, 1), ledger(4, 3), thing("chair4", 3, 4), thing("chair6", 6, 4), album(7, 6), lamp(9, 8), thing("cupboard", 0, 6)] },
            { floor: "slate", items: [round(5, 4), pic("r", 1.6, 40, 34, 26, 0), pic("r", 4.2, 40, 34, 26, 1), pic("r", 6.8, 40, 34, 26, 2), shelfY(0, 0, 9), shelfY(3, 0, 3), ledger(4, 3), album(7, 1), album(2, 6), lamp(9, 8), thing("stool", 6, 4)] },
            { floor: "wood", items: [rug(1, 6, 8, 2), pic("l", 2, 50, 30, 22, 0), pic("l", 5, 50, 30, 22, 1), shelfX(4, 0, 6), shelfX(4, 3, 4), ledger(1, 1), thing("chair6", 3, 2), album(2, 6), album(6, 6), thing("crate", 0, 8), thing("barrel", 9, 8), lamp(0, 4)] }
        ],
        "12x10": [
            { floor: "wood", items: [round(7, 5), pic("r", 1.5, 34, 34, 26, 0), pic("r", 4.1, 34, 34, 26, 2), pic("r", 6.7, 34, 34, 26, 3), pic("r", 9.3, 34, 34, 26, 1), shelfY(0, 0, 10), thing("globe", 1, 1), ledger(6, 4), album(2, 2), album(2, 6), album(9, 1), album(9, 7), lamp(1, 9), lamp(11, 1)] },
            { floor: "slate", items: [rug(0, 7, 12, 2), pic("r", 1.7, 56, 30, 22, 0), pic("r", 4.3, 56, 30, 22, 1), pic("r", 7, 56, 30, 22, 2), shelfY(0, 0, 6), shelfY(3, 0, 6), shelfY(6, 0, 6), shelfY(9, 0, 6), ledger(10, 2), album(1, 7), album(3, 7), album(8, 7), lamp(11, 9), thing("candelabra", 0, 9)] },
            { floor: "wood", items: [rug(3, 3, 6, 4), pic("l", 2, 36, 34, 26, 0), pic("l", 4.6, 36, 34, 26, 1), pic("l", 7.2, 36, 34, 26, 2), shelfX(0, 0, 12), ledger(5, 4), thing("chair4", 4, 5), thing("chair6", 7, 5), album(1, 3), album(9, 2), album(1, 7), album(9, 7), lamp(0, 9), lamp(11, 9)] }
        ],
        "16x8": [
            { floor: "slate", items: [rug(1, 3, 14, 2), ...[0, 2, 3, 4, 5, 6].map((s, i) => pic("r", 1.3 + i * 2.2, 62, 28, 20, s)), ...[7, 8, 9, 10, 11, 1].map((s, i) => pic("r", 1.3 + i * 2.2, 18, 28, 20, s)), shelfY(0, 2, 5), ledger(3, 5), album(11, 5), album(13, 1), thing("chair4", 2, 6), lamp(15, 7)] },
            { floor: "wood", items: [round(8, 3), pic("r", 3.5, 44, 34, 26, 0), pic("r", 6.5, 44, 34, 26, 2), pic("r", 9.5, 44, 34, 26, 3), pic("r", 12.5, 44, 34, 26, 1), shelfY(0, 0, 8), shelfY(14, 0, 3), ledger(7, 2), album(3, 2), album(11, 2), album(3, 5), album(11, 5), lamp(1, 7), lamp(15, 7)] },
            { floor: "slate", items: [rug(0, 5, 16, 2), pic("r", 1.6, 56, 30, 22, 0), pic("r", 13, 56, 30, 22, 1), shelfY(3, 0, 4), shelfY(6, 0, 4), shelfY(9, 0, 4), shelfY(12, 0, 4), ledger(1, 2), album(4, 5), album(10, 5), album(13, 1), album(1, 5), thing("globe", 15, 7), lamp(0, 7)] }
        ]
    };
    /* the size a maze gets, by how much there is of it */
    const sizeFor = pictures => pictures <= 9 ? "9x8" : pictures <= 19 ? "10x9" : pictures <= 39 ? "12x10" : "16x8";
    /* rooms behind the doors you link by hand: the staff corridors and the way behind a bookcase. No maze is ever given these sizes */
    const st = (k, x, y, more) => ({ k: "st_" + k, x, y, ...(more || {}) });
    S["6x14"] = [
        { floor: "slate", walls: "staff", items: [st("hazard", 0, 8), st("grate", 3, 6), st("pipes", 0, 0), st("duct", 0, 0), st("vent", 0, 2), st("ventx", 2, 0), st("cabinet", 0, 4), st("boiler", 0, 9), st("fan", 0, 12), st("light_batten", 0, 1), st("light_bulkhead", 0, 7), st("light_pendant", 3, 3)] },
        { floor: "slate", walls: "staff", items: [st("pipes", 0, 0), st("ventx", 2, 0), st("cabinet", 0, 9), st("grate", 3, 3), st("light_caged", 0, 2), st("light_caged", 0, 7), st("light_work", 4, 9)] },
        { floor: "slate", walls: "staff", items: [st("duct", 0, 0), st("vent", 0, 4), st("fan", 0, 8), st("grate", 2, 8), st("light_pendant", 2, 3), st("light_bulkhead", 0, 11)] }
    ];
    S["8x6"] = [{ floor: "wood", walls: "", items: [lamp(0, 5), thing("globe", 6, 0)] }, { floor: "wood", walls: "", items: [lamp(7, 0)] }, { floor: "slate", walls: "", items: [lamp(0, 5)] }];
    S["4x8"] = [
        { floor: "slate", walls: "", items: [st("light_caged", 0, 3)] },
        { floor: "slate", walls: "", items: [thing("crate", 0, 0), st("light_caged", 0, 4)] },
        { floor: "slate", walls: "staff", items: [st("light_batten", 0, 3)] }
    ];
    const api = { layouts: S, sizeFor };
    if (typeof module !== "undefined") module.exports = api; else window.RoomStarter = api;
})();
