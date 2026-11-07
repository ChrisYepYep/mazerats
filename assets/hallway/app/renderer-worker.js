/* Made by tools/hallway-editor/make-renderer.js. Don't edit it here. */
"use strict";
const ART_FILES = ["av/figure.txt","av/l-0-std-0.png","av/l-0-wlk-0.png","av/l-0-wlk-1.png","av/l-0-wlk-2.png","av/l-0-wlk-3.png","av/l-2-std-0.png","av/l-2-wlk-0.png","av/l-2-wlk-1.png","av/l-2-wlk-2.png","av/l-2-wlk-3.png","av/l-3-std-0.png","av/l-3-wlk-0.png","av/l-3-wlk-1.png","av/l-3-wlk-2.png","av/l-3-wlk-3.png","av/l-4-std-0.png","av/l-4-wlk-0.png","av/l-4-wlk-1.png","av/l-4-wlk-2.png","av/l-4-wlk-3.png","av/l-5-std-0.png","av/l-5-wlk-0.png","av/l-5-wlk-1.png","av/l-5-wlk-2.png","av/l-5-wlk-3.png","av/m-0-std-0.png","av/m-0-wlk-0.png","av/m-0-wlk-1.png","av/m-0-wlk-2.png","av/m-0-wlk-3.png","av/m-2-std-0.png","av/m-2-wlk-0.png","av/m-2-wlk-1.png","av/m-2-wlk-2.png","av/m-2-wlk-3.png","av/m-3-std-0.png","av/m-3-wlk-0.png","av/m-3-wlk-1.png","av/m-3-wlk-2.png","av/m-3-wlk-3.png","av/m-4-std-0.png","av/m-4-wlk-0.png","av/m-4-wlk-1.png","av/m-4-wlk-2.png","av/m-4-wlk-3.png","av/m-5-std-0.png","av/m-5-wlk-0.png","av/m-5-wlk-1.png","av/m-5-wlk-2.png","av/m-5-wlk-3.png","av/s-0-sit-0.png","av/s-0-sit-crr-0.png","av/s-0-sit-drk-0.png","av/s-0-std-0.png","av/s-0-std-crr-0.png","av/s-0-std-drk-0.png","av/s-0-wlk-0.png","av/s-0-wlk-1.png","av/s-0-wlk-2.png","av/s-0-wlk-3.png","av/s-0-wlk-crr-0.png","av/s-0-wlk-crr-1.png","av/s-0-wlk-crr-2.png","av/s-0-wlk-crr-3.png","av/s-1-sit-0.png","av/s-1-sit-crr-0.png","av/s-1-sit-drk-0.png","av/s-1-std-0.png","av/s-1-std-crr-0.png","av/s-1-std-drk-0.png","av/s-1-wlk-0.png","av/s-1-wlk-1.png","av/s-1-wlk-2.png","av/s-1-wlk-3.png","av/s-1-wlk-crr-0.png","av/s-1-wlk-crr-1.png","av/s-1-wlk-crr-2.png","av/s-1-wlk-crr-3.png","av/s-2-sit-0.png","av/s-2-sit-crr-0.png","av/s-2-sit-drk-0.png","av/s-2-std-0.png","av/s-2-std-crr-0.png","av/s-2-std-drk-0.png","av/s-2-wlk-0.png","av/s-2-wlk-1.png","av/s-2-wlk-2.png","av/s-2-wlk-3.png","av/s-2-wlk-crr-0.png","av/s-2-wlk-crr-1.png","av/s-2-wlk-crr-2.png","av/s-2-wlk-crr-3.png","av/s-3-sit-0.png","av/s-3-sit-crr-0.png","av/s-3-sit-drk-0.png","av/s-3-std-0.png","av/s-3-std-crr-0.png","av/s-3-std-drk-0.png","av/s-3-wlk-0.png","av/s-3-wlk-1.png","av/s-3-wlk-2.png","av/s-3-wlk-3.png","av/s-3-wlk-crr-0.png","av/s-3-wlk-crr-1.png","av/s-3-wlk-crr-2.png","av/s-3-wlk-crr-3.png","av/s-4-sit-0.png","av/s-4-sit-crr-0.png","av/s-4-sit-drk-0.png","av/s-4-std-0.png","av/s-4-std-crr-0.png","av/s-4-std-drk-0.png","av/s-4-wlk-0.png","av/s-4-wlk-1.png","av/s-4-wlk-2.png","av/s-4-wlk-3.png","av/s-4-wlk-crr-0.png","av/s-4-wlk-crr-1.png","av/s-4-wlk-crr-2.png","av/s-4-wlk-crr-3.png","av/s-5-sit-0.png","av/s-5-sit-crr-0.png","av/s-5-sit-drk-0.png","av/s-5-std-0.png","av/s-5-std-crr-0.png","av/s-5-std-drk-0.png","av/s-5-wlk-0.png","av/s-5-wlk-1.png","av/s-5-wlk-2.png","av/s-5-wlk-3.png","av/s-5-wlk-crr-0.png","av/s-5-wlk-crr-1.png","av/s-5-wlk-crr-2.png","av/s-5-wlk-crr-3.png","av/s-6-sit-0.png","av/s-6-sit-crr-0.png","av/s-6-sit-drk-0.png","av/s-6-std-0.png","av/s-6-std-crr-0.png","av/s-6-std-drk-0.png","av/s-6-wlk-0.png","av/s-6-wlk-1.png","av/s-6-wlk-2.png","av/s-6-wlk-3.png","av/s-6-wlk-crr-0.png","av/s-6-wlk-crr-1.png","av/s-6-wlk-crr-2.png","av/s-6-wlk-crr-3.png","av/s-7-sit-0.png","av/s-7-sit-crr-0.png","av/s-7-sit-drk-0.png","av/s-7-std-0.png","av/s-7-std-crr-0.png","av/s-7-std-drk-0.png","av/s-7-wlk-0.png","av/s-7-wlk-1.png","av/s-7-wlk-2.png","av/s-7-wlk-3.png","av/s-7-wlk-crr-0.png","av/s-7-wlk-crr-1.png","av/s-7-wlk-crr-2.png","av/s-7-wlk-crr-3.png","edge-gold.png","edge-wood.png","fontdump.html","hall/hh_room_hallway/background_pixel.png","hall/hh_room_hallway/door_lower_left.png","hall/hh_room_hallway/door_lower_left_mask.png","hall/hh_room_hallway/door_lower_right.png","hall/hh_room_hallway/door_lower_right_mask.png","hall/hh_room_hallway/door_upper_left.png","hall/hh_room_hallway/door_upper_left_mask.png","hall/hh_room_hallway/door_upper_right.png","hall/hh_room_hallway/door_upper_right_mask.png","hall/hh_room_hallway/entry_lower_left.png","hall/hh_room_hallway/entry_lower_left_mask1.png","hall/hh_room_hallway/entry_lower_left_mask2.png","hall/hh_room_hallway/entry_lower_right.png","hall/hh_room_hallway/entry_lower_right_mask1.png","hall/hh_room_hallway/entry_lower_right_mask2.png","hall/hh_room_hallway/entry_upper_left.png","hall/hh_room_hallway/entry_upper_left_mask.png","hall/hh_room_hallway/entry_upper_left_mask2.png","hall/hh_room_hallway/entry_upper_right.png","hall/hh_room_hallway/entry_upper_right_mask.png","hall/hh_room_hallway/exitshape.png","hall/hh_room_hallway/floor_left_thickness.png","hall/hh_room_hallway/floor_left_thickness2.png","hall/hh_room_hallway/floor_mat_lower_corner.png","hall/hh_room_hallway/floor_mat_lower_crossroad.png","hall/hh_room_hallway/floor_mat_lower_end.png","hall/hh_room_hallway/floor_mat_middle_crossroad.png","hall/hh_room_hallway/floor_mat_side_corner.png","hall/hh_room_hallway/floor_mat_straight.png","hall/hh_room_hallway/floor_mat_upper_corner.png","hall/hh_room_hallway/floor_mat_upper_crossroad.png","hall/hh_room_hallway/floor_mat_upper_end.png","hall/hh_room_hallway/floor_plain_tiles.png","hall/hh_room_hallway/floor_plain_tiles_small.png","hall/hh_room_hallway/floor_right_thickness.png","hall/hh_room_hallway/floor_right_thickness2.png","hall/hh_room_hallway/hiliter_pub.png","hall/hh_room_hallway/hwv_evergreen1_a_0_0_0.png","hall/hh_room_hallway/hwv_evergreen2_a_0_0_0.png","hall/hh_room_hallway/hwv_evergreen3_a_0_0_0.png","hall/hh_room_hallway/hwv_evergreen4_a_0_0_0.png","hall/hh_room_hallway/hwv_evergreen5_a_0_0_0.png","hall/hh_room_hallway/hwv_flower1_a_0_0_0.png","hall/hh_room_hallway/hwv_flower2_a_0_0_0.png","hall/hh_room_hallway/hwv_flower3_a_0_0_0.png","hall/hh_room_hallway/hwv_flower4_a_0_0_0.png","hall/hh_room_hallway/hwv_flower5_a_0_0_0.png","hall/hh_room_hallway/hwv_stone1_a_0_0_0.png","hall/hh_room_hallway/hwv_stone2_a_0_0_0.png","hall/hh_room_hallway/hwv_stone3_a_0_0_0.png","hall/hh_room_hallway/hwv_stone4_a_0_0_0.png","hall/hh_room_hallway/hwv_stone5_a_0_0_0.png","hall/hh_room_hallway/hwv_walnut1_a_0_0_0.png","hall/hh_room_hallway/hwv_walnut2_a_0_0_0.png","hall/hh_room_hallway/hwv_walnut3_a_0_0_0.png","hall/hh_room_hallway/hwv_walnut4_a_0_0_0.png","hall/hh_room_hallway/hwv_walnut5_a_0_0_0.png","hall/hh_room_hallway/hw_chair_a_0_0_0.png","hall/hh_room_hallway/hw_chair_a_0_2_0.png","hall/hh_room_hallway/hw_chair_b_0_0_0.png","hall/hh_room_hallway/hw_chair_b_0_2_0.png","hall/hh_room_hallway/hw_chair_sd.png","hall/hh_room_hallway/hw_closet1_a_0_2_0.png","hall/hh_room_hallway/hw_closet3_a_0_2_0.png","hall/hh_room_hallway/hw_ero1_a_0_0_0.png","hall/hh_room_hallway/hw_ero2_a_0_0_0.png","hall/hh_room_hallway/hw_ero3_a_0_0_0.png","hall/hh_room_hallway/hw_ero4_a_0_0_0.png","hall/hh_room_hallway/hw_ero5_a_0_0_0.png","hall/hh_room_hallway/hw_fountain_a_0_0_0.png","hall/hh_room_hallway/hw_painting1_a_0_4_0.png","hall/hh_room_hallway/hw_painting2_a_0_4_0.png","hall/hh_room_hallway/hw_plant_a_0_0_0.png","hall/hh_room_hallway/hw_plant_sd.png","hall/hh_room_hallway/hw_pntg_a_0_0_0.png","hall/hh_room_hallway/hw_shelf_a_0_4_0.png","hall/hh_room_hallway/hw_shelf_sd_4.png","hall/hh_room_hallway/hw_smtble_a_0_0_0.png","hall/hh_room_hallway/hw_smtble_sd.png","hall/hh_room_hallway/hw_sofa1_a_0_2_0.png","hall/hh_room_hallway/hw_sofa2_a_0_2_0.png","hall/hh_room_hallway/hw_sofa3_a_0_2_0.png","hall/hh_room_hallway/hw_sofa3_b_0_2_0.png","hall/hh_room_hallway/hw_statue_a_0_0_0.png","hall/hh_room_hallway/hw_table1_a_0_0_0.png","hall/hh_room_hallway/hw_table1_sd.png","hall/hh_room_hallway/hw_table2_a_0_0_0.png","hall/hh_room_hallway/hw_table2_sd.png","hall/hh_room_hallway/hw_table3_a_0_0_0.png","hall/hh_room_hallway/hw_table3_sd.png","hall/hh_room_hallway/hw_watermatic_a_0_4_0.png","hall/hh_room_hallway/hw_watermatic_sd.png","hall/hh_room_hallway/pillar0_a_0_0_0.png","hall/hh_room_hallway/pillar1_a_0_0_0.png","hall/hh_room_hallway/pillar1_sd.png","hall/hh_room_hallway/stairs_lower_left.png","hall/hh_room_hallway/stairs_lower_left2.png","hall/hh_room_hallway/stairs_lower_right.png","hall/hh_room_hallway/stairs_lower_right2.png","hall/hh_room_hallway/stairs_lower_right_mask1.png","hall/hh_room_hallway/stairs_lower_right_mask2.png","hall/hh_room_hallway/stairs_lower_right_mask3.png","hall/hh_room_hallway/stairs_upper_corner_mask.png","hall/hh_room_hallway/stairs_upper_left.png","hall/hh_room_hallway/stairs_upper_left_corner_mask.png","hall/hh_room_hallway/stairs_upper_left_crossroad_mask.png","hall/hh_room_hallway/stairs_upper_left_mask.png","hall/hh_room_hallway/stairs_upper_left_mask2_corner.png","hall/hh_room_hallway/stairs_upper_left_mask3_corner.png","hall/hh_room_hallway/stairs_upper_left_mask3_straight.png","hall/hh_room_hallway/stairs_upper_left_straight_mask.png","hall/hh_room_hallway/stairs_upper_right.png","hall/hh_room_hallway/stairs_upper_right_crossroad_mask.png","hall/hh_room_hallway/stairs_upper_right_straight_mask.png","hall/hh_room_hallway/wall_lower_left.png","hall/hh_room_hallway/wall_lower_left2.png","hall/hh_room_hallway/wall_lower_left3.png","hall/hh_room_hallway/wall_lower_right.png","hall/hh_room_hallway/wall_lower_right2.png","hall/hh_room_hallway/wall_lower_right3.png","hall/hh_room_hallway/wall_upper_left_basic.png","hall/hh_room_hallway/wall_upper_mask.png","hall/hh_room_hallway/wall_upper_mask2.png","hall/hh_room_hallway/wall_upper_right_basic.png","ideas/book.json","ideas/book.png","ideas/lost/s_balloon_air_0_0_a.png","ideas/lost/s_CF_10_coin_gold_0_0_a.png","ideas/lost/s_dark_deepgrove_mushroom_pot_0_0_a.png","ideas/lost/s_deadduck2_0_0_a.png","ideas/lost/s_deadduck3_0_0_a.png","ideas/lost/s_deepgrove_mushroom_pot_0_0_a.png","ideas/lost/s_drinks_0_0_a.png","ideas/lost/s_duck_0_4_a.png","ideas/lost/s_duck_devil_0_4_a.png","ideas/lost/s_duck_pirate_blk_0_4_a.png","ideas/lost/s_duck_pirate_blu_0_4_a.png","ideas/lost/s_duck_pirate_grn_0_4_a.png","ideas/lost/s_duck_pirate_purp_0_4_a.png","ideas/lost/s_duck_pirate_red_0_4_a.png","ideas/lost/s_duck_straw_0_4_a.png","ideas/lost/s_duck_witch_0_4_a.png","ideas/lost/s_earthen_deepgrove_mushroom_pot_0_0_a.png","ideas/lost/s_easterduck_0_2_a.png","ideas/lost/s_fall_duck_0_4_a.png","ideas/lost/s_farm_l_sprinkler_0_2_a.png","ideas/lost/s_farm_sprinkler_0_2_a.png","ideas/lost/s_genieduck_0_2_a.png","ideas/lost/s_glukko_bottles_0_2_a.png","ideas/lost/s_glukko_bowl1_0_2_a.png","ideas/lost/s_glukko_duck_0_4_a.png","ideas/lost/s_glukko_petmush_0_2_a.png","ideas/lost/s_glukko_sardine_0_2_a.png","ideas/lost/s_hotduck_0_4_a.png","ideas/lost/s_hween08_defibs2_0_2_b.png","ideas/lost/s_hween08_defibs_0_2_b.png","ideas/lost/s_jp_tray1_0_0_a.png","ideas/lost/s_jp_tray2_0_0_a.png","ideas/lost/s_jp_tray3_0_0_a.png","ideas/lost/s_jp_tray4_0_0_a.png","ideas/lost/s_jp_tray5_0_0_a.png","ideas/lost/s_jp_tray6_0_0_a.png","ideas/lost/s_obsidian_deepgrove_mushroom_pot_0_0_a.png","ideas/lost/s_rcandle_0_0_a.png","ideas/lost/s_reinduck_0_4_a.png","ideas/lost/s_steam_duck_0_4_a.png","ideas/lost/s_streetduck_0_4_a.png","ideas/lost/s_sunsetcafe_c20_duck_0_2_a.png","ideas/lost/s_sushiduck1_0_4_b.png","ideas/lost/s_sushiduck2_0_4_b.png","ideas/lost/s_sushiduck3_0_4_b.png","ideas/lost/s_valeduck_0_4_a.png","ideas/lost/s_verdigris_deepgrove_mushroom_pot_0_0_a.png","ideas/lost/s_wcandle_0_0_a.png","ideas/lost/s_wrapped_duck_0_4_a.png","ideas/lost/s_xmasduck_0_4_a.png","ideas/lost.json","ideas/rat.json","ideas/rat.png","ideas/scrap.png","lamp-ghost.png","lamp-globe.png","lamp-hotel.png","lamp-tiffany.png","lamp-torch.png","lamps/globe-lamp.png","lamps/globe-wall-light-back.png","lamps/globe-wall-light.png","lamps/wall-light.png","npc/hustle/figure.txt","npc/hustle/s-0-std-0.png","npc/hustle/s-1-std-0.png","npc/hustle/s-2-std-0.png","npc/hustle/s-3-std-0.png","npc/hustle/s-4-std-0.png","npc/hustle/s-5-std-0.png","npc/hustle/s-6-std-0.png","npc/hustle/s-7-std-0.png","regs.json","rooms/barrel.png","rooms/book-black.png","rooms/book-green.png","rooms/book-navy.png","rooms/book-ochre.png","rooms/book-oxblood.png","rooms/book-plum.png","rooms/book-teal.png","rooms/candelabra.png","rooms/chair4.png","rooms/chair6.png","rooms/crate.png","rooms/cupboard.png","rooms/globe.png","rooms/index.json","rooms/lamp.png","rooms/lampglow.png","rooms/ledger.png","rooms/modal_topclose_x.png","rooms/pointer.png","rooms/rug-round.png","rooms/shelf1.png","rooms/shelf19.png","rooms/shelf2.png","rooms/shelf20.png","rooms/shelf21.png","rooms/shelf22.png","rooms/shelf23.png","rooms/shelf24.png","rooms/shelf25.png","rooms/shelf26.png","rooms/shelf27.png","rooms/shelf3.png","rooms/shelf4.png","rooms/shelf5.png","rooms/shelf6.png","rooms/slate.png","rooms/stool.png","rooms/st_boiler.png","rooms/st_cabinet.png","rooms/st_duct.png","rooms/st_fan.png","rooms/st_grate.png","rooms/st_hazard.png","rooms/st_light_batten.png","rooms/st_light_bulkhead.png","rooms/st_light_caged.png","rooms/st_light_pendant.png","rooms/st_light_work.png","rooms/st_pipes.png","rooms/st_vent.png","rooms/st_ventx.png","rooms/table.png","rooms/title_pattern.png","rooms/VolterGoldfish.woff2","rooms/VolterGoldfishBold.woff2","rooms/window-l.png","rooms/window-r.png","rooms/window_frame.png","sconce-globe-back-l.png","sconce-globe-back-r.png","sconce-globe-x.png","sconce-globe-y.png","sconce-x.png","sconce-y.png","tele/hh_furni_special_50/s_doorD_a_0_1_1_4_1.png","tele/hh_furni_special_50/s_doorD_b_0_1_1_4_0.png","tele/hh_furni_special_50/s_doorD_b_0_1_1_4_1.png","tele/hh_furni_special_50/s_doorD_c_0_1_1_4_1.png","thumbs/crest.png","thumbs/door.png","thumbs/floor.png","thumbs/lamp.png","thumbs/lift.png","thumbs/pillartall.png","thumbs/planter-evergreen.png","thumbs/planter-flower.png","thumbs/planter-stone.png","thumbs/planter-walnut.png","thumbs/planter.png","thumbs/rope.png","thumbs/rug.png","thumbs/sconce.png","thumbs/side.png","thumbs/sideturn.png","thumbs/sofa.png","thumbs/stair.png","thumbs/table.png","thumbs/turn.png","tile-selector.png","wall/h_painting1.png","wall/h_painting2.png","wall/h_pntg.png","wall/i_bar.png","wall/i_bar_m.png","wall/i_board.png","wall/i_bookdoor.png","wall/i_bunting.png","wall/i_cabinet.png","wall/i_canes.png","wall/i_chip1.png","wall/i_chip2.png","wall/i_chip3.png","wall/i_crack.png","wall/i_crack2.png","wall/i_damp.png","wall/i_damp_run.png","wall/i_desk.png","wall/i_festoon.png","wall/i_festoon_lit.png","wall/i_fireexit.png","wall/i_fireexit_lit.png","wall/i_fireexit_lit_m.png","wall/i_fireexit_m.png","wall/i_freedoor.png","wall/i_freedoor_m.png","wall/i_garland.png","wall/i_ghost_oval.png","wall/i_ghost_row.png","wall/i_ghost_tall.png","wall/i_ghost_wide.png","wall/i_gift1.png","wall/i_gift2.png","wall/i_gift3.png","wall/i_gift4.png","wall/i_guides.png","wall/i_guides_m.png","wall/i_holly.png","wall/i_key.png","wall/i_lpsign.png","wall/i_lpsign_m.png","wall/i_mark_scuff.png","wall/i_mark_tile.png","wall/i_panel.png","wall/i_peel_corner.png","wall/i_peel_patch.png","wall/i_peel_small.png","wall/i_peel_strip.png","wall/i_photo.png","wall/i_photo_br.png","wall/i_photo_es.png","wall/i_poster.png","wall/i_poster_m.png","wall/i_rarecase.png","wall/i_ratcase.png","wall/i_rathole.png","wall/i_rc_balloon_air.png","wall/i_rc_balloon_scraps.png","wall/i_rc_balloon_skin.png","wall/i_rc_build_prize1.png","wall/i_rc_build_prize2.png","wall/i_rc_build_prize3.png","wall/i_rc_capsule_bronze.png","wall/i_rc_capsule_silver.png","wall/i_rc_CF_10_coin_gold.png","wall/i_rc_CF_1_coin_bronze.png","wall/i_rc_CF_5_coin_silver.png","wall/i_rc_dark_deepgrove_cyclops.png","wall/i_rc_dark_deepgrove_duck.png","wall/i_rc_dark_deepgrove_mushroom_pot.png","wall/i_rc_dark_floordimmer.png","wall/i_rc_davehologram.png","wall/i_rc_deadduck.png","wall/i_rc_deadduck2.png","wall/i_rc_deadduck3.png","wall/i_rc_deepgrove_cyclops.png","wall/i_rc_deepgrove_duck.png","wall/i_rc_deepgrove_mushroom_pot.png","wall/i_rc_divider_silo1.png","wall/i_rc_drinks.png","wall/i_rc_duck.png","wall/i_rc_duck_devil.png","wall/i_rc_duck_pirate_blk.png","wall/i_rc_duck_pirate_blu.png","wall/i_rc_duck_pirate_grn.png","wall/i_rc_duck_pirate_purp.png","wall/i_rc_duck_pirate_red.png","wall/i_rc_duck_straw.png","wall/i_rc_duck_witch.png","wall/i_rc_earthen_deepgrove_cyclops.png","wall/i_rc_earthen_deepgrove_duck.png","wall/i_rc_earthen_deepgrove_mushroom_pot.png","wall/i_rc_easterduck.png","wall/i_rc_fall_duck.png","wall/i_rc_farm_l_sprinkler.png","wall/i_rc_farm_sprinkler.png","wall/i_rc_ff_c25_clover.png","wall/i_rc_ff_c25_durector.png","wall/i_rc_ff_c25_luckyduck.png","wall/i_rc_floordimmer.png","wall/i_rc_genieduck.png","wall/i_rc_glukko_bottles.png","wall/i_rc_glukko_bowl1.png","wall/i_rc_glukko_duck.png","wall/i_rc_glukko_jar.png","wall/i_rc_glukko_lamp.png","wall/i_rc_glukko_petmush.png","wall/i_rc_glukko_sardine.png","wall/i_rc_hologram.png","wall/i_rc_hotduck.png","wall/i_rc_house2.png","wall/i_rc_hween08_defibs.png","wall/i_rc_hween08_defibs2.png","wall/i_rc_joulutahti.png","wall/i_rc_jp_tray1.png","wall/i_rc_jp_tray2.png","wall/i_rc_jp_tray3.png","wall/i_rc_jp_tray4.png","wall/i_rc_jp_tray5.png","wall/i_rc_jp_tray6.png","wall/i_rc_mushroom_basket.png","wall/i_rc_mushroom_blue_duck.png","wall/i_rc_mushroom_duck.png","wall/i_rc_mushroom_yellow_duck.png","wall/i_rc_obsidian_deepgrove_cyclops.png","wall/i_rc_obsidian_deepgrove_duck.png","wall/i_rc_obsidian_deepgrove_mushroom_pot.png","wall/i_rc_pirate_bottle_1.png","wall/i_rc_pirate_bottle_10.png","wall/i_rc_pirate_bottle_2.png","wall/i_rc_pirate_bottle_3.png","wall/i_rc_pirate_bottle_4.png","wall/i_rc_pirate_bottle_5.png","wall/i_rc_pirate_bottle_6.png","wall/i_rc_pirate_bottle_7.png","wall/i_rc_pirate_bottle_8.png","wall/i_rc_pirate_bottle_9.png","wall/i_rc_prize1.png","wall/i_rc_prize2.png","wall/i_rc_prize3.png","wall/i_rc_pumpcandle.png","wall/i_rc_qt_sum11_petfood.png","wall/i_rc_qt_sum11_shell2.png","wall/i_rc_qt_val11_holoduck.png","wall/i_rc_rcandle.png","wall/i_rc_redhologram.png","wall/i_rc_reinduck.png","wall/i_rc_sheji_divider.png","wall/i_rc_skullcandle.png","wall/i_rc_small_xmastree.png","wall/i_rc_song_disk.png","wall/i_rc_steam_duck.png","wall/i_rc_streetduck.png","wall/i_rc_sunsetcafe_c20_duck.png","wall/i_rc_sushiduck1.png","wall/i_rc_sushiduck2.png","wall/i_rc_sushiduck3.png","wall/i_rc_toby_grave_fire.png","wall/i_rc_toby_mode_lever.png","wall/i_rc_triplecandle.png","wall/i_rc_urban_wpost.png","wall/i_rc_valeduck.png","wall/i_rc_verdigris_deepgrove_cyclops.png","wall/i_rc_verdigris_deepgrove_duck.png","wall/i_rc_verdigris_deepgrove_mushroom_pot.png","wall/i_rc_wcandle.png","wall/i_rc_wrapped_duck.png","wall/i_rc_xmasduck.png","wall/i_snowman.png","wall/i_stockings.png","wall/i_theatre.png","wall/i_theatre_m.png","wall/i_trophy.png","wall/i_view_dawn.png","wall/i_view_day.png","wall/i_view_dusk.png","wall/i_view_night.png","wall/i_view_snow_dawn.png","wall/i_view_snow_day.png","wall/i_view_snow_dusk.png","wall/i_view_snow_night.png","wall/i_window.png","wall/i_wreath.png","wall/i_xmasdrinks.png","wall/i_xmasduck.png","wall/i_xmaslantern.png","wall/i_xmassmalltree.png","wall/i_xmastree.png","wall/p_autumn_wood.png","wall/p_calm_seas.png","wall/p_gentleman_rat.png","wall/p_gilt_trio.png","wall/p_golden_key.png","wall/p_maze_plan.png","wall/p_moonlit_maze.png","wall/p_old_mountains.png","wall/p_still_life.png"];
/* The small stand-ins for Node, for the renderer in a browser (make-renderer.js). */
class Buffer extends Uint8Array {
    static alloc(n) { return new Buffer(n); }
    static from(x, enc) {
        if (typeof x === "string") { const b = new Buffer(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return b; }
        const b = new Buffer(x.length); b.set(x); return b;
    }
    static concat(list) { let n = 0; for (const b of list) n += b.length; const out = new Buffer(n); let p = 0; for (const b of list) { out.set(b, p); p += b.length; } return out; }
    copy(target, at = 0, from = 0, to = this.length) { target.set(Uint8Array.prototype.subarray.call(this, from, to), at); return to - from; }
    readUInt32BE(p) { return ((this[p] << 24) >>> 0) + (this[p + 1] << 16) + (this[p + 2] << 8) + this[p + 3]; }
    toString(enc, a = 0, b = this.length) { let s = ""; for (let i = a; i < b; i++) s += String.fromCharCode(this[i]); return s; }
}
const ROOT = "/site/tools/hallway-editor/", MAZES = "/site/tools/.cache/maze-list.txt";
const FILES = new Map(), INFLATED = new Map();
let mazeList = "", lastRead = null;
const posix = {
    normalize(p) { const out = []; for (const s of p.split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return "/" + out.join("/"); },
    resolve(...a) { let p = ""; for (const s of a) p = String(s).startsWith("/") ? s : p + "/" + s; return posix.normalize(p); },
    join(...a) { return posix.normalize(a.join("/")); },
    sep: "/", dirname(p) { return posix.normalize(p + "/.."); }
};
const relOf = p => { const n = posix.normalize(String(p)); return n.startsWith(ROOT) ? n.slice(ROOT.length) : n; };
const fsShim = {
    existsSync(p) { const r = relOf(p); return FILES.has(r) || r === MAZES; },
    statSync(p) { if (!this.existsSync(p)) throw new Error("No such file: " + p); return { mtimeMs: 1 }; },
    readFileSync(p, enc) {
        const r = relOf(p);
        if (r === MAZES) return mazeList;
        const f = FILES.get(r); if (!f) throw new Error("No such file: " + p);
        lastRead = r;
        if (!enc) return f;
        return enc === "latin1" ? f.toString("latin1") : new TextDecoder().decode(f);
    },
    writeFileSync() { throw new Error("Nothing is written here"); }
};
/* The art was unpacked ahead of time; the one just read is the one being asked for. */
const zlibShim = { inflateSync() { const b = INFLATED.get(lastRead); if (!b) throw new Error("Not unpacked: " + lastRead); return b; } };
const MODULES = {}, LOADED = {};
function requireFrom(dir) {
    return name => {
        if (name === "fs") return fsShim;
        if (name === "path") return posix;
        if (name === "zlib") return zlibShim;
        if (/png-encode\.js$/.test(name)) return { encodePng() { throw new Error("Not in a browser"); } };
        if (/regs\.json$/.test(name)) return JSON.parse(fsShim.readFileSync(ROOT + "art/regs.json", "utf8"));
        const base = name.split("/").pop();
        if (!MODULES[base]) throw new Error("No such module: " + name);
        if (LOADED[base]) return LOADED[base].exports;
        const m = LOADED[base] = { exports: {} };
        MODULES[base].run(m, m.exports, requireFrom(MODULES[base].dir), MODULES[base].dir);
        return m.exports;
    };
}
/* One PNG's compressed part, unpacked, so the reader can carry on without waiting */
async function inflatePng(bytes) {
    const b = Buffer.from(bytes), parts = []; let p = 8;
    while (p < b.length) {
        const len = b.readUInt32BE(p), type = b.toString("latin1", p + 4, p + 8);
        if (type === "IDAT") parts.push(b.subarray(p + 8, p + 8 + len));
        if (type === "IEND") break;
        p += 12 + len;
    }
    const stream = new Blob([Buffer.concat(parts)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return Buffer.from(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function loadArt(base) {
    let at = 0;
    const one = async () => {
        while (at < ART_FILES.length) {
            const rel = ART_FILES[at++], r = await fetch(base + "art/" + rel.split("/").map(encodeURIComponent).join("/")); if (!r.ok) throw new Error("Couldn't load " + rel);
            const f = Buffer.from(new Uint8Array(await r.arrayBuffer()));
            FILES.set("art/" + rel, f);
            if (rel.endsWith(".png")) INFLATED.set("art/" + rel, await inflatePng(f));
        }
    };
    await Promise.all(Array.from({ length: 8 }, one));
}

MODULES["hw.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* Mock-up renderer for the archive hallway. Pure pixel work in Node. */
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "../../..").replace(/\\/g, "/") + "/";
const { readPng } = require(R + "tools/png-decode.js");
const { encodePng } = require(R + "tools/png-encode.js");
const S = path.resolve(__dirname, "../art").replace(/\\/g, "/");
const PIECES = S + "/hall/hh_room_hallway/";

const cache = {};
const piece = n => cache[n] || (cache[n] = readPng(PIECES + n + ".png"));
const load = p => cache[p] || (cache[p] = readPng(p));
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

class Buf {
    constructor(w, h, c) {
        this.w = w; this.h = h; this.d = Buffer.alloc(w * h * 4);
        const [r, g, b] = hex(c || "000000");
        for (let i = 0; i < w * h; i++) { this.d[i * 4] = r; this.d[i * 4 + 1] = g; this.d[i * 4 + 2] = b; this.d[i * 4 + 3] = 255; }
    }
    set(x, y, c) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const p = (y * this.w + x) * 4; this.d[p] = c[0]; this.d[p + 1] = c[1]; this.d[p + 2] = c[2];
    }
    get(x, y) { const p = (y * this.w + x) * 4; return [this.d[p], this.d[p + 1], this.d[p + 2]]; }
    rect(x, y, w, h, c) { const k = typeof c === "string" ? hex(c) : c; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, k); }
    blit(im, x0, y0, o) {
        o = o || {};
        const sc = o.scale || 1, w = im.w, h = im.h;
        const dw = im.d ? 0 : 0;
        const src = im.rgba;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const sx = o.flip ? w - 1 - x : x;
            const s = (y * w + sx) * 4;
            if (src[s + 3] < 128) continue;
            for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) this.set(x0 + x * sc + b, y0 + y * sc + a, [src[s], src[s + 1], src[s + 2]]);
        }
    }
    crop(x, y, w, h) {
        const o = new Buf(w, h, "07060a");
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const X = x + i, Y = y + j;
            if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
            o.set(i, j, this.get(X, Y));
        }
        return o;
    }
    paste(b, x, y, sc) {
        sc = sc || 1;
        for (let j = 0; j < b.h * sc; j++) for (let i = 0; i < b.w * sc; i++) this.set(x + i, y + j, b.get(Math.floor(i / sc), Math.floor(j / sc)));
    }
    /* box-averaged shrink, only ever for the whole-hallway overviews */
    shrink(n) {
        const o = new Buf(Math.floor(this.w / n), Math.floor(this.h / n));
        for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) {
            let r = 0, g = 0, b = 0;
            for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) { const k = this.get(i * n + c, j * n + a); r += k[0]; g += k[1]; b += k[2]; }
            o.set(i, j, [r / (n * n), g / (n * n), b / (n * n)]);
        }
        return o;
    }
    /* Scale2x (EPX): a clean double of pixel art */
    scale2x() {
        const o = new Buf(this.w * 2, this.h * 2);
        const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            const P = this.get(x, y);
            const A = y > 0 ? this.get(x, y - 1) : P, B = x < this.w - 1 ? this.get(x + 1, y) : P, C = x > 0 ? this.get(x - 1, y) : P, D = y < this.h - 1 ? this.get(x, y + 1) : P;
            let e0 = P, e1 = P, e2 = P, e3 = P;
            if (!eq(C, B) && !eq(A, D)) {
                if (eq(C, A)) e0 = A; if (eq(A, B)) e1 = B; if (eq(C, D)) e2 = C; if (eq(D, B)) e3 = B;
            }
            o.set(x * 2, y * 2, e0); o.set(x * 2 + 1, y * 2, e1); o.set(x * 2, y * 2 + 1, e2); o.set(x * 2 + 1, y * 2 + 1, e3);
        }
        return o;
    }
    save(p) { fs.writeFileSync(p, encodePng(this.w, this.h, this.d)); }
}

/* ---------- fonts ---------- */
const dump = fs.readFileSync(S + "/fontdump.html", "latin1");
const m = /<pre id="o">([\s\S]*?)<\/pre>/.exec(dump);
const VOL = JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
function textW(s, f) { let w = 0; for (const ch of s) w += (VOL[f || "v"][ch] || VOL.v[" "]).w; return w; }
function text(buf, s, x, y, c, o) {
    o = o || {}; const f = o.font || "v", sc = o.scale || 1, k = typeof c === "string" ? hex(c) : c;
    if (o.center) x -= Math.round(textW(s, f) * sc / 2);
    for (const ch of s) {
        const g = VOL[f][ch] || VOL.v[" "];
        g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) buf.set(x + (i - 1) * sc + b, y + (j - 2) * sc + a, k); });
        x += g.w * sc;
    }
    return x;
}

/* The little 3x5 capitals for half-scale signs */
const F3 = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100", G: "011100101101011",
    H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101",
    O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111",
    V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010", Z: "111001010100111",
    0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110", 4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
    " ": "000000000000000", "%": "101001010100101", "(": "010100100100010", ")": "010001001001010", ".": "000000000000010", ",": "000000000010100", "?": "110001010000010", "$": "011110010011110", "!": "010010010000010", "'": "010010000000000", "-": "000000111000000", "_": "000000000000111"
};

/* ---------- geometry ---------- */
const TW = 32, TH = 16;
class World {
    constructor(cfg) {
        this.cfg = cfg;
        const L = cfg.L, W = cfg.W, A = cfg.A || 0;
        this.ox = (W + A + 10) * 16 + 40; this.oy = (A + 10) * 8 + 170;
        const w = (L + W + 2 * A + 20) * 16 + 80, h = (L + W + 2 * A + 20) * 8 + 300;
        this.b = new Buf(w, h, cfg.void || "07060a");
        this.floorMask = new Uint8Array(w * h);
        this.sprites = []; this.post = []; this.lamps = [];
    }
    S(x, y) { return [Math.round((x - y) * 16) + this.ox, Math.round((x + y) * 8) + this.oy]; }
    /* a point on a wall along x at depth y, h px up: u is px across from x */
    WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; }
    /* a point on a wall along y at x (faces +x); u px across going -> up-right from (x,y) */
    WY(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] - Math.floor(u / 2) - h]; }
    isCross(X) { return (this.cfg.cross || []).find(c => X >= c && X < c + this.cfg.C); }
    tileIn(X, Y) {
        const c = this.cfg, L = c.L, W = c.W;
        if (X < 0 || X >= L) return false;
        if (Y >= 0 && Y < W) return true;
        if (c.A && this.isCross(X) !== undefined && Y >= -c.A && Y < W + c.A) return true;
        return false;
    }
}

const srcStraightX = piece("floor_mat_straight");
const srcStraightY = piece("floor_mat_straight");
const srcCross = piece("floor_mat_middle_crossroad");
const srcPlain = piece("floor_plain_tiles");

function modPx(im, flip, mx, my, dx, dy) {
    /* apex of the 8x8 module at (129,0) in the piece, tile pos (mx,my) */
    const px = (mx - my) * 16 + 128 + dx, py = (mx + my) * 8 + dy;
    const sx = flip ? im.w - 1 - px - (im.w - 257 - 1) : px;
    if (sx < 0 || py < 0 || sx >= im.w || py >= im.h) return null;
    const s = (py * im.w + sx) * 4;
    if (im.rgba[s + 3] < 128) return null;
    return [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]];
}

/* map a corridor cross-position Y (0..W) to a module tile, keeping trim and widening the core */
const acrossMap = (Y, W) => {
    /* Y 0,1 and the last two are plain parquet (null); then the module's own edge and trim; a widened core */
    if (Y < 2 || Y >= W - 2) return null;
    const y = Y - 2, n = W - 4;
    return y < 3 ? y : (y >= n - 3 ? y - (n - 8) : 3 + ((y - 3) % 2));
};
const plainAt = (X, Y, dx, dy) => modPx(srcPlain, false, 2 + (((X % 4) + 4) % 4), 2 + (((Y % 4) + 4) % 4), dx, dy);

function floorPass(w, filter) {
    const c = w.cfg, b = w.b;
    for (let sy = 0; sy < b.h; sy++) for (let sx = 0; sx < b.w; sx++) {
        const rx = sx - w.ox, ry = sy - w.oy;
        const fx = (rx + 2 * ry) / 32, fy = (2 * ry - rx) / 32;
        const X = Math.floor(fx), Y = Math.floor(fy);
        if (!w.tileIn(X, Y) || !filter(X, Y)) continue;
        const dx = rx - (X - Y) * 16, dy = ry - (X + Y) * 8;
        let col = null;
        const cr = w.isCross(X);
        if (cr !== undefined) {
            const a = X - cr, C = c.C, A = c.A, W = c.W;
            const cx = 2, cw = C - 4;                     // carpet across the crossing
            const inX = a >= cx && a < cx + cw;
            if (Y >= 0 && Y < W && inX) {
                /* the square middle, with the medallion at its centre */
                const ma = a - cx - (cw - 4) / 2, mb = Y - (W - 4) / 2;
                if (ma >= 0 && ma < 4 && mb >= 0 && mb < 4) col = modPx(srcCross, false, 2 + ma, 2 + mb, dx, dy);
                else col = modPx(srcStraightX, true, 2 + (X % 4), 4, dx, dy);
            } else if (Y >= 0 && Y < W) {
                { const my = acrossMap(Y, W); col = my === null ? plainAt(X, Y, dx, dy) : modPx(srcStraightX, true, 2 + (X % 4), my, dx, dy); }
            } else if (inX) {
                /* the side arm: same carpet, turned to run along y */
                const YY = Y < 0 ? Y + A : Y - W;              // 0..A-1 outward
                const out = Y < 0 ? A - 1 - YY : YY;           // 0 at the corridor, A-1 at the end
                if (out >= A - 1) col = modPx(srcPlain, false, 2 + (X % 4), 2 + (((Y % 4) + 4) % 4), dx, dy);
                else { const aa = acrossMap(a - cx + 2, cw + 4); col = aa === null ? plainAt(X, Y, dx, dy) : modPx(srcStraightY, false, aa, 2 + (((Y % 4) + 4) % 4), dx, dy); }
            } else {
                col = modPx(srcPlain, false, 2 + (X % 4), 2 + (((Y % 4) + 4) % 4), dx, dy);
            }
        } else {
            const my = acrossMap(Y, c.W);
            col = my === null ? plainAt(X, Y, dx, dy) : modPx(srcStraightX, true, 2 + (X % 4), my, dx, dy);
        }
        if (col) { b.set(sx, sy, col); w.floorMask[sy * b.w + sx] = 1; }
    }
}

function edgePass(w) {
    /* the slab's thickness below its visible edges */
    const b = w.b, ND = 13;
    const pal = ["000000", "c79556", "b1804a", "9d7146", "9d7146", "895e39", "000000", "895e39", "4d2312", "895e39", "4d2312", "000000"].map(hex);
    for (let sx = 0; sx < b.w; sx++) for (let sy = b.h - ND - 2; sy > 0; sy--) {
        if (!w.floorMask[sy * b.w + sx] || w.floorMask[(sy + 1) * b.w + sx]) continue;
        const rx = sx - w.ox, ry = sy - w.oy;
        const fy = (2 * ry - rx) / 32, fx = (rx + 2 * ry) / 32;
        /* only the near edges, never the seam behind the main wall */
        const X = Math.floor(fx), Y = Math.floor(fy);
        if (Y < 0) continue;
        for (let d = 0; d < pal.length; d++) {
            if (w.floorMask[(sy + 1 + d) * b.w + sx]) break;
            let k = pal[d];
            if (d >= 1 && d <= 5 && ((sx >> 1) & 3) === 0) k = k.map(v => Math.round(v * .86));
            b.set(sx, sy + 1 + d, k);
        }
    }
}

/* The client's wall piece is 8 tiles of wall (128px) plus a 10px end post, on the right of the x piece and the left of
   the y piece. The wall repeats from fixed points on the map, so a long wall is one unbroken pattern however the floor
   is cut up; the post only goes where the wall really ends (o.noEnd: the wall carries on past this run). */
const WALL_MOD = 128, WALL_POST = 10, WALL_START = 24;
function wallRunX(w, x0, x1, y, o) {
    const raw = w.tallX || piece("wall_upper_right_basic"), seam = w.seamX || raw, T = w.wallTop || 101, b = w.b;
    const column = (p, i, im = seam, limit = 1e9) => {
        let n = 0;
        for (let j = 0; j < im.h; j++) {
            if (j - T > Math.floor(i / 2)) continue;
            const s = (j * im.w + i) * 4; if (im.rgba[s + 3] < 128) continue;
            if (n++ >= limit) break;
            b.set(p[0] + i, p[1] - T + j, [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]]);
        }
        const up = im.above && im.above[i]; if (up) for (const q of up) b.set(p[0] + i, p[1] - T + q[0], [q[1], q[2], q[3]]);
    };
    const half = o && o.half, none = o && o.none, gone = half && (at => half(at) || none(at)), ends = [], lowEnds = [], lowStarts = [];
    for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) {
        const p = w.S(x, y);
        if (p[0] > b.w + 20 || p[0] + 160 < -20 || p[1] - T > b.h + 100 || p[1] + 100 < -20) continue;
        for (let i = 0; i < WALL_MOD; i++) {
            const at = x * 16 + i; if (at < x0 * 16 || at >= x1 * 16) continue;
            if (o && o.col) o.col(at);
            /* a stretch set to half height: the low panelled wall instead. The full wall beside it ends properly, as at any wall's end. */
            if (none && none(at)) continue;
            if (half && half(at)) { o.halfCol(at, p[0] + i, p[1] + Math.floor(i / 2)); if (((at % 16) + 16) % 16 === 15 && at + 1 < x1 * 16 && none(at + 1)) lowEnds.push(Math.floor(at / 16) + 1); if (((at % 16) + 16) % 16 === 0 && (at === x0 * 16 ? !o.noStart : none(at - 1))) lowStarts.push(at / 16); continue; }
            const t = Math.floor(at / 16); let from = null;
            if (half) { if (gone((t - 1) * 16) && !o.seamless((t - 1) * 16)) from = t; else if (gone((t - 2) * 16) && !o.seamless((t - 2) * 16)) from = t - 1; }
            if (from !== null && at < from * 16 + WALL_START) column(w.S(from, y), at - from * 16, raw);
            else if (!(o && o.noStart) && at < x0 * 16 + WALL_START) column(w.S(x0, y), at - x0 * 16, raw);
            else column(p, i);
            if (half && ((at % 16) + 16) % 16 === 15 && at + 1 < x1 * 16 && gone(at + 1) && !o.seamless(at + 1)) ends.push(t + 1);
        }
    }
    for (const e of ends) { const p = w.S(e - 8, y); if (o.col) o.col(e * 16 - 1); for (let i = WALL_MOD; i < WALL_MOD + WALL_POST; i++) column(p, i, raw); }
    for (const e of lowEnds) { if (o.col) o.col(e * 16 - 1); o.halfEnd(w.S(e, y)); }
    for (const e of lowStarts) { if (o.col) o.col(e * 16); o.halfStart(w.S(e, y)); }
    if (!(o && o.noEnd)) {
        if (o && o.col) o.col(x1 * 16 - 1);
        if (none && none(x1 * 16 - 1)) { /* nothing there to end */ }
        else if (half && half(x1 * 16 - 1)) o.halfEnd(w.S(x1, y));
        else { const p = w.S(x1 - 8, y); for (let i = WALL_MOD; i < WALL_MOD + WALL_POST; i++) column(p, i, raw, o && o.endKeep); }
    }
}

function wallRunY(w, x, y0, y1, o) {
    /* along y at fixed x, facing +x. Runs up-right as y falls. */
    const raw = w.tallY || piece("wall_upper_left_basic"), seam = w.seamY || raw, T = w.wallTop || 101, b = w.b, W = WALL_MOD + WALL_POST;
    const column = (p, i, im = seam, limit = 1e9) => {
        let n = 0;
        for (let j = 0; j < im.h; j++) {
            if (j - T > Math.floor((W - i) / 2)) continue;
            const s = (j * im.w + i) * 4; if (im.rgba[s + 3] < 128) continue;
            if (n++ >= limit) break;
            b.set(p[0] - W + i, p[1] - T + j, [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]]);
        }
        const up = im.above && im.above[i]; if (up) for (const q of up) b.set(p[0] - W + i, p[1] - T + q[0], [q[1], q[2], q[3]]);
    };
    const half = o && o.half, none = o && o.none, gone = half && (at => half(at) || none(at)), ends = [], lowEnds = [], lowStarts = [];
    for (let y = Math.floor(y0 / 8) * 8; y < y1; y += 8) {
        const p = w.S(x, y);                                     // apex of the module this piece stands on
        if (p[0] - W > b.w + 20 || p[0] < -20 || p[1] - T > b.h + 100 || p[1] + 100 < -20) continue;
        for (let i = WALL_POST; i < W; i++) {
            const at = y * 16 + (W - i); if (at <= y0 * 16 || at > y1 * 16) continue;
            if (o && o.col) o.col(at);
            if (none && none(at)) continue;
            if (half && half(at)) { o.halfCol(at, p[0] - W + i, p[1] + Math.floor((W - i) / 2)); if (((at % 16) + 16) % 16 === 0 && at < y1 * 16 && none(at + 1)) lowEnds.push(at / 16); if (((at % 16) + 16) % 16 === 1 && (at === y0 * 16 + 1 ? !o.noStart : none(at - 1))) lowStarts.push((at - 1) / 16); continue; }
            const t = Math.floor((at - 1) / 16); let from = null;
            if (half) { if (gone((t - 1) * 16 + 1) && !o.seamless((t - 1) * 16 + 1)) from = t; else if (gone((t - 2) * 16 + 1) && !o.seamless((t - 2) * 16 + 1)) from = t - 1; }
            if (from !== null && at <= from * 16 + WALL_START) column(w.S(x, from), W - (at - from * 16), raw);
            else if (!(o && o.noStart) && at <= y0 * 16 + WALL_START) column(w.S(x, y0), W - (at - y0 * 16), raw);
            else column(p, i);
            if (half && ((at % 16) + 16) % 16 === 0 && at < y1 * 16 && gone(at + 1) && !o.seamless(at + 1)) ends.push(at / 16);
        }
    }
    for (const e of ends) { const p = w.S(x, e - 8); if (o.col) o.col(e * 16); for (let i = 0; i < WALL_POST; i++) column(p, i, raw); }
    for (const e of lowEnds) { if (o.col) o.col(e * 16); o.halfEnd(w.S(x, e)); }
    for (const e of lowStarts) { if (o.col) o.col(e * 16 + 1); o.halfStart(w.S(x, e)); }
    if (!(o && o.noEnd)) {
        if (o && o.col) o.col(y1 * 16);
        if (none && none(y1 * 16)) { /* nothing there to end */ }
        else if (half && half(y1 * 16)) o.halfEnd(w.S(x, y1));
        else { const p = w.S(x, y1 - 8); for (let i = 0; i < WALL_POST; i++) column(p, i, raw, o && o.endKeep); }
    }
}

/* ---------- custom art ---------- */
const C = {
    k: hex("000000"), d0: hex("240a02"), d1: hex("450e00"), d2: hex("5a1a06"), d3: hex("712f16"), d4: hex("7d4122"), d5: hex("925030"), d6: hex("af6947"), d7: hex("cb8444"),
    b1: hex("7a4a14"), b2: hex("b47a22"), b3: hex("ddaa63"), b4: hex("f2be70"), b5: hex("ffe7a8"),
    ink: hex("1c0c06"), plate: hex("2b1006"), glow: hex("ffd98a")
};

function door(w, x, y, o) {
    /* A hotel door set into a wall along x: 2 tiles across, 2 panels, brass kick
       and handle, a fanlight over it. u = px across, h = px up. */
    o = o || {};
    const b = w.b, DW = 32, DH = 62;
    const pal = o.pal || {};
    const leaf = pal.leaf || [C.d3, C.d4, C.d5, C.d2, C.d6];   // base, lit, hi, shade, edge
    for (let u = -4; u < DW + 4; u++) for (let h = 0; h < DH + 7; h++) {
        const P = o.mapY ? w.WY(x, y, DW - 1 - u, h) : w.WX(x, y, u, h);
        let c = null;
        const fr = u < 0 || u >= DW || h >= DH;               // the frame
        if (fr) {
            const outer = u === -4 || u === DW + 3 || h === DH + 6;
            const inner = u === -1 || u === DW || h === DH;
            if (outer) c = C.k;
            else if (h === DH + 5 ) c = C.d7;
            else if (inner) c = C.d1;
            else if (u === -3 || h === DH + 4) c = C.d6;
            else if (u >= DW && u === DW + 2) c = C.d2;
            else c = C.d5;
            /* the lintel's little keystone */
            if (h >= DH + 1 && h <= DH + 4 && u >= 13 && u <= 18) c = (u === 13 || h === DH + 4) ? C.b4 : C.b2;
            if (h >= DH + 1 && h <= DH + 4 && (u === 12 || u === 19)) c = C.d1;
        } else if (o.open) {
            /* open: the leaf has swung in; the dark room beyond */
            const leafW = 7;
            if (u < 3) c = u === 0 ? C.d1 : C.d2;                 // jamb in shadow
            else if (u < 3 + leafW) {
                const v = h - (u - 3);                            // leaf recedes as it swings
                c = v > DH - 3 ? hex("0a0506") : u === 3 + leafW - 1 ? C.d5 : ((u & 1) ? C.d3 : C.d2);
                if (v < 2) c = hex("0a0506");
            }
            else {
                const fl = Math.max(0, 8 - h);
                c = h < 7 ? [20 + fl * 4, 12 + fl * 2, 12] : [8, 6, 10];
                if (h === 0) c = C.b2;
            }
        } else {
            /* the jamb the viewer can see, then the door leaf */
            if (u < 2) c = u === 0 ? C.d0 : C.d1;
            else if (h >= DH - 2) c = C.d1;
            else if (h === 0) c = C.k;
            else {
                const lu = u - 2, W = DW - 2;
                c = leaf[0];
                if (lu === 0) c = leaf[4]; else if (lu === W - 1) c = leaf[3];
                const inP = (a, bb) => h >= a && h < bb && lu >= 4 && lu < W - 4;
                const top = inP(33, 57), bot = inP(8, 29);
                if (top || bot) {
                    const a = top ? 33 : 8, bb = top ? 57 : 29;
                    if (lu === 4 || h === bb - 1) c = leaf[3];
                    else if (lu === W - 5 || h === a) c = leaf[2];
                    else if (lu === 5 || h === bb - 2) c = C.d2;
                    else c = ((lu + (h >> 1)) % 7 === 0) ? leaf[0] : leaf[1];
                }
                if (h >= 1 && h <= 5) c = h === 5 ? C.b4 : (h === 1 ? C.b1 : C.b2);    // kick plate
            }
            /* handle on the free side */
            if (u >= 5 && u <= 7 && h >= 28 && h <= 32) c = (h === 32) ? C.b5 : (u === 7 ? C.b1 : C.b3);
            if (o.hover && !fr) c = c.map((v, i) => Math.min(255, v + [26, 18, 4][i]));
        }
        if (c) b.set(P[0], P[1], c);
    }
    /* the door's number-free name sign goes on the wallpaper above */
    if (o.name) w.post.push({ kind: "signX", x: o.mapY ? x : x + 1, y: o.mapY ? y - 1 : y, h: DH + 11, name: o.name, hover: o.hover, alongY: !!o.mapY });
    /* a mat on the floor in front */
    w.mats = w.mats || [];
    if (!o.mapY) w.mats.push({ x, y: y, n: 1, hover: o.hover });
}

function mats(w) {
    /* a short brass-edged runner in front of each far door */
    const b = w.b;
    for (const m of (w.mats || [])) {
        const a = w.S(m.x, m.y);
        for (let t = 0; t < 32; t++) for (let v = 0; v < 18; v++) {
            /* t along x (px), v along y (px) */
            const sx = a[0] + t - v, sy = a[1] + Math.floor(t / 2) + Math.floor(v / 2);
            if (!w.floorMask[sy * b.w + sx]) continue;
            let c = (t + v) % 2 ? hex("3a0a12") : hex("4c1018");
            if (v === 0 || v === 17 || t < 1 || t > 30) c = C.k;
            else if (v === 1 || v === 16 || t < 2 || t > 29) c = C.b3;
            else if (v === 3 || v === 14 || t === 3 || t === 28) c = hex("6e1a14");
            b.set(sx, sy, c);
            if (sx - 1 >= 0) b.set(sx - 1, sy, c);    // close the 2:1 gaps
        }
    }
}

const FloorLamps = require("./floor-lamps.js");
/* A round pleated shade, seen from above, lit from inside: a soft ramp across and up it, with pleats that only
   just show. yb is the middle of its bottom edge, H its height, rb and rt its radius at bottom and top. */
const SHADES = {
    lit: { ramp: ["fff6d6", "ffeebf", "ffe2a6", "fbd28d", "f0bd74", "dda45e", "c48a4a"], glow: "fffdf0", inner: "b98244" },
    off: { ramp: ["efe2c4", "e6d7b6", "dccca8", "cfbd96", "bfab84", "ab9570", "927d5a"], glow: "6e5c42", inner: "54462f" },
    dead: { ramp: ["7a6a52", "705f49", "665641", "5a4b39", "4e4131", "43372a", "382e23"], glow: "2a2018", inner: "3a2e22" }
};
function pleatedShade(b, cx, yb, H, rb, rt, kind, colour) {
    const S = SHADES[kind] || SHADES.lit, tone = c => colour && kind === "lit" ? FloorLamps.tintGlow(c, colour) : c, RAMP = S.ramp.map(hex).map(tone), glow = tone(hex(S.glow)), inner = tone(hex(S.inner)), yt = yb - H, ry = Math.max(2, Math.round(rb / 3));
    for (let i = -rb; i <= rb; i++) {
        const ai = Math.abs(i), bottom = yb + Math.round(ry * Math.sqrt(1 - (i * i) / (rb * rb)));
        const top = ai <= rt ? yt - Math.round(Math.sqrt(1 - (i * i) / (rt * rt))) : Math.round(yt + (ai - rt) / (rb - rt) * (yb - yt));
        for (let Y = top; Y <= bottom; Y++) {
            const across = (i + rb) / (2 * rb), down = (Y - top) / Math.max(1, bottom - top);
            const form = Math.abs(across - .38) * 6.2 + (1 - down) * 1.6 + ((i + 40) % 2 ? .45 : 0);
            b.set(cx + i, Y, RAMP[Math.max(0, Math.min(6, Math.round(form)))]);
        }
        b.set(cx + i, top - 1, C.k); b.set(cx + i, bottom + 1, C.k);
        b.set(cx + i, bottom, i < 1 ? C.b4 : i < 4 ? C.b3 : C.b2);           // the brass trim along the bottom edge
    }
    for (let Y = yt; Y <= yb; Y++) { const r = Math.round(rt + (rb - rt) * (Y - yt) / (yb - yt)) + 1; b.set(cx - r, Y, C.k); b.set(cx + r, Y, C.k); }
    /* the open top, with the bulb's glow inside */
    for (let i = -rt + 1; i <= rt - 1; i++) { b.set(cx + i, yt - (Math.abs(i) < rt - 1 ? 1 : 0), Math.abs(i) < 2 ? glow : inner); if (Math.abs(i) < rt - 1) b.set(cx + i, yt, Math.abs(i) < 2 ? glow : inner); }
}
function lamp(w, x, y, o) {
    /* A small brass wall light that stands out from the wall: an oval plate flat on the wall, a swan-neck arm
       leaving it square to the wall, a turned cup, and a round pleated shade seen from above, lit from inside.
       Every brass part is built as a shape first and then outlined, so its black line never breaks. */
    o = o || {};
    const b = w.b, h0 = w.lampH === undefined ? 66 : w.lampH, at = (u, h) => o.mapY ? w.WY(x, y, u, h0 + h) : w.WX(x, y, u, h0 + h);
    const A = at(0, 0), out = o.mapY ? 1 : -1, dead = !!o.dead;      // out: straight out from the wall, on screen
    /* his picture, if there is one */
    const drawnArt = !o.drawn && FloorLamps.sconce(out, !!w.lightsOff || dead, o.colour);
    if (drawnArt) {
        for (const [dx, dy, c, glass] of drawnArt) {
            const X = A[0] + dx, Y = A[1] + dy; b.set(X, Y, c);
            if (X >= 0 && Y >= 0 && X < b.w && Y < b.h) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.keep) w.keep[Y * b.w + X] = v; if (glass && w.glowing) w.glowing[Y * b.w + X] = v; }
        }
        const pa = o.mapY ? w.WY(x, y, 0, h0 + 4) : w.WX(x, y, 0, h0 + 4);
        w.lamps.push({ x: pa[0], y: pa[1], dead, weak: !!o.weak, tx: x, ty: y, i: (w.lamps || []).length, colour: o.colour });
        return;
    }
    const solid = (cells, colour) => {
        const seen = new Set(cells.map(q => q[0] + "," + q[1]));
        for (const [X, Y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((X + dx) + "," + (Y + dy))) b.set(X + dx, Y + dy, C.k);
        for (const q of cells) b.set(q[0], q[1], colour(q[0], q[1]));
    };
    /* the plate, on the wall */
    const plate = [];
    for (let u = -2; u <= 2; u++) for (let h = -5; h <= 3; h++) if ((u * u) / 6.25 + ((h + 1) * (h + 1)) / 20.25 <= 1) { const P = at(u, h); plate.push([P[0], P[1], u, h]); }
    solid(plate.map(q => [q[0], q[1]]), (X, Y) => { const q = plate.find(p => p[0] === X && p[1] === Y), lit = q[2] * out < 0 ? 0 : 1; return q[3] >= 2 ? C.b4 : q[3] <= -4 ? C.b1 : lit ? C.b3 : C.b2; });
    /* the arm: a curve out from the plate, down a little, then up into the cup */
    const REACH = 11, P0 = [0, -1], P1 = [out * 7, 10], P2 = [out * REACH, -2], arm = new Map();
    for (let t = 0; t <= 1.0001; t += .02) {
        const mt = 1 - t, X = A[0] + Math.round(mt * mt * P0[0] + 2 * mt * t * P1[0] + t * t * P2[0]), Y = A[1] + Math.round(mt * mt * P0[1] + 2 * mt * t * P1[1] + t * t * P2[1]);
        arm.set(X + "," + Y, [X, Y]);
    }
    const armCells = [...arm.values()], topOf = new Map(); for (const [X, Y] of armCells) if (!topOf.has(X) || Y < topOf.get(X)) topOf.set(X, Y);
    solid(armCells, (X, Y) => (X - A[0]) * out < 4 ? C.b2 : C.b3);
    const cx = A[0] + P2[0], cup = A[1] + P2[1];
    /* the cup and collar under the shade */
    const cupCells = []; for (let i = -2; i <= 2; i++) for (let j = 0; j <= 1; j++) if (Math.abs(i) < 2 || j === 0) cupCells.push([cx + i, cup - 1 + j]);
    solid(cupCells, (X) => X < cx ? C.b4 : X === cx ? C.b3 : C.b1);
    pleatedShade(b, cx, cup - 4, 8, 6, 4, dead ? "dead" : w.lightsOff ? "off" : "lit", o.colour);
    const p = o.mapY ? w.WY(x, y, 0, h0 + 4) : w.WX(x, y, 0, h0 + 4);
    w.lamps.push({ x: p[0], y: p[1], dead, weak: !!o.weak, tx: x, ty: y, i: (w.lamps || []).length, colour: o.colour });
}

/* the pillar made taller: its shaft row repeated, so the cap and the plinth keep their size */
const stretchedMemo = new Map();
function stretched(part, by) {
    const key = part + "|" + by; let m = stretchedMemo.get(key); if (m) return m;
    const im = piece(part), SHAFT = 30, h = im.h + by, rgba = Buffer.alloc(im.w * h * 4);
    for (let y = 0; y < h; y++) { const from = y <= SHAFT ? y : y <= SHAFT + by ? SHAFT : y - by; im.rgba.copy(rgba, y * im.w * 4, from * im.w * 4, (from + 1) * im.w * 4); }
    m = { w: im.w, h, rgba }; stretchedMemo.set(key, m); return m;
}
function furni(w, name, tx, ty, o) {
    /* standard placement: loc = the tile's left corner */
    o = o || {};
    if (o.layer === undefined && ty < 0 && w.inRecess) { }
    const a = w.S(tx, ty);
    const loc = [a[0] - 16, a[1] + 8];
    (ty < 0 && !w.noRecess ? (w.recess = w.recess || []) : w.sprites).push({ depth: tx + ty + (o.dz || 0), ftx: tx, fty: ty, draw: () => {
        for (const part of [].concat(name)) {
            const im = o.stretch ? stretched(part, o.stretch) : piece(part);
            const reg = REG[part] || [0, 0];
            const x0 = o.flip ? loc[0] + 32 + reg[0] - im.w : loc[0] - reg[0];
            const X0 = x0 + (o.ox || 0), Y0 = loc[1] - reg[1] + (o.oy || 0) - (o.stretch || 0);
            w.b.blit(im, X0, Y0, { flip: o.flip });
            /* a piece that keeps its own colours on every floor: note what it painted, so the recolouring leaves it */
            if (o.keepColour && w.keep) for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
                if (im.rgba[(j * im.w + i) * 4 + 3] < 128) continue;
                const X = X0 + (o.flip ? im.w - 1 - i : i), Y = Y0 + j; if (X < 0 || Y < 0 || X >= w.b.w || Y >= w.b.h) continue;
                const p = (Y * w.b.w + X) * 4;
                /* tint: a part of it that takes the floor's colour after all, like a sofa's cushions */
                const t = o.tint && o.tint([w.b.d[p], w.b.d[p + 1], w.b.d[p + 2]], part, i, j);
                if (t) { w.b.d[p] = t[0]; w.b.d[p + 1] = t[1]; w.b.d[p + 2] = t[2]; }
                w.keep[Y * w.b.w + X] = ((w.b.d[p] << 16) | (w.b.d[p + 1] << 8) | w.b.d[p + 2]) + 1;
            }
        }
    }});
}
const REGS = JSON.parse(fs.readFileSync(S + "/regs.json", "utf8"));
const REG = REGS.hall;

function avatar(w, who, tx, ty, dir, row) {
    w.sprites.push({ depth: tx + ty + .5, draw: () => {
        const a = w.S(tx, ty);
        const sheet = load(R + "assets/img/standins/" + who + "-s.png");
        const cw = 33, ch = 56, cx = dir * cw, cy = row * ch;
        const x0 = a[0] - 16, y0 = a[1] + 8 - (ch - 6);
        /* a soft pixel shadow */
        for (let j = -3; j <= 3; j++) for (let i = -9; i <= 9; i++) if (i * i / 81 + j * j / 9 < 1) {
            const X = a[0] + i, Y = a[1] + 8 + j;
            if ((X + Y) % 2 === 0) { const k = w.b.get(X, Y); w.b.set(X, Y, k.map(v => v * .55)); }
        }
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
            const s = ((cy + j) * sheet.w + cx + i) * 4;
            if (sheet.rgba[s + 3] < 128) continue;
            w.b.set(x0 + i, y0 + j, [sheet.rgba[s], sheet.rgba[s + 1], sheet.rgba[s + 2]]);
        }
    }});
    w.avatarAt = { who, tx, ty, dir, row };
}

function booth(w, tx, ty) {
    /* TELEPORT. Custom: a tall panelled cabinet with a lit arched door, on one tile. */
    (ty < 0 ? (w.recess = w.recess || []) : w.sprites).push({ depth: tx + ty + .9, draw: () => {
        const b = w.b, H = 72;
        const a = w.S(tx, ty);            // apex
        const left = [a[0] - 16, a[1] + 8], bottom = [a[0], a[1] + 16], right = [a[0] + 16, a[1] + 8];
        const set = (x, y, c) => b.set(x, y, c);
        /* the +y face: from left corner to bottom corner (u 0..16), the door */
        for (let u = 0; u < 16; u++) for (let h = 0; h < H; h++) {
            const x = left[0] + u, y = left[1] + Math.floor(u / 2) - h;
            let c = C.d4;
            if (u === 0 || h === H - 1 || h === 0) c = C.k;
            else if (u === 15) c = C.d6;
            else if (h >= H - 5) c = h === H - 2 ? C.d7 : C.d5;
            else if (h <= 4) c = h === 4 ? C.b4 : C.b2;
            else {
                /* arched window */
                const cu = 7.5, half = 5.5, top = H - 12, spring = top - 5;
                const du = Math.abs(u - cu);
                const inside = u >= 2 && u <= 13 && h >= 8 && (h <= spring || ((u - cu) * (u - cu)) / (half * half) + ((h - spring) * (h - spring)) / 25 <= 1);
                if (inside) {
                    const shine = (h + u * 2) % 19 < 3;
                    c = shine ? hex("e6fbff") : ((h >> 2) + (u >> 1)) % 2 ? hex("6fd8e8") : hex("49b6d8");
                    if (u === 2 || du > half - .9) c = C.b4;
                } else c = (u + h) % 5 === 0 ? C.d3 : C.d4;
            }
            set(x, y, c);
        }
        /* the +x face: from bottom corner to right corner, plain panels */
        for (let u = 0; u < 17; u++) for (let h = 0; h < H; h++) {
            const x = bottom[0] + u, y = bottom[1] - Math.floor(u / 2) - h;
            let c = C.d2;
            if (u === 16 || h === H - 1 || h === 0) c = C.k;
            else if (u === 0) c = C.d3;
            else if (h >= H - 5) c = h === H - 2 ? C.d5 : C.d3;
            else if (h <= 4) c = h === 4 ? C.b2 : C.b1;
            else if (u >= 3 && u <= 13 && h >= 10 && h <= H - 11) c = (u === 3 || h === H - 11) ? C.d1 : (u === 13 || h === 10) ? C.d3 : C.d2;
            else c = C.d2;
            set(x, y, c);
        }
        /* the lid */
        for (let i = -16; i <= 16; i++) { const hh = 8 - Math.ceil(Math.abs(i) / 2); for (let j = -hh; j <= hh; j++) {
            const x = a[0] + i, y = a[1] + 8 + j - H;
            set(x, y, Math.abs(j) === hh ? C.k : (i < 0 ? C.d7 : C.d6));
        } }
        /* a small lit lantern on top */
        for (let j = 0; j < 7; j++) for (let i = -2; i <= 2; i++) set(a[0] + i, a[1] + 6 - H - j, (j === 6 || j === 0 || Math.abs(i) === 2) ? C.k : hex("8fe8f6"));
    }});
    const p = w.S(tx, ty);
    w.lamps.push({ x: p[0], y: p[1] - 20, cyan: true, tx, ty });
}

function nearFrame(w, x, o) {
    /* A near-side doorway stands on the slab's near edge. We see its OUTER face, so
       the sign reads the right way round; a heavy frame with a pediment, and a
       step down into the dark. Between its posts you see the hall behind. */
    o = o || {};
    const y = w.cfg.W, DW = 32, DH = 66;
    w.sprites.push({ depth: x + y + 1.1, draw: () => {
        const b = w.b;
        for (const pu of [-7, DW]) for (let u = 0; u < 7; u++) for (let h = -13; h < DH + 2; h++) {
            const P = w.WX(x, y, pu + u, h);
            let c = u === 0 || u === 6 ? C.k : u === 1 ? C.d6 : u === 5 ? C.d2 : (u === 3 ? C.d5 : C.d4);
            if (h <= 0) c = (h === -13 || u === 0 || u === 6) ? C.k : (h >= -1 ? C.k : C.d2);
            if (h > 0 && h <= 7 && u > 0 && u < 6) c = h === 7 ? C.b4 : h === 1 ? C.b1 : C.b2;
            b.set(P[0], P[1], c);
        }
        /* the lintel */
        for (let u = -7; u < DW + 7; u++) for (let h = DH; h < DH + 17; h++) {
            const P = w.WX(x, y, u, h);
            let c = (u % 3 === 0) ? C.d3 : C.d4;
            if (h === DH || h === DH + 16 || u === -7 || u === DW + 6) c = C.k;
            else if (h === DH + 15) c = C.d7;
            else if (h === DH + 14) c = C.d5;
            else if (h === DH + 1) c = C.d1;
            else if (h === DH + 13) c = C.d2;
            b.set(P[0], P[1], c);
        }
        /* the sill, and the dark step under it */
        for (let u = 0; u < DW; u++) for (let d = -13; d <= 1; d++) {
            const P = w.WX(x, y, u, d);
            b.set(P[0], P[1], d === 1 ? C.b4 : d === 0 ? C.b2 : d === -1 ? C.k : d === -13 ? C.k : hex("120806"));
        }
    }});
    w.post.push({ kind: "signX", x: x + 1, y, h: DH + 22, name: o.name, near: true, hover: o.hover });
}

function rail(w, x0, x1) {
    /* a low panelled wall along the near edge, in the client's low-wall colours */
    if (x1 <= x0) return;
    const y = w.cfg.W, H = 15;
    w.sprites.push({ depth: x0 + y + 1, draw: () => {
        const b = w.b, px = (x1 - x0) * 16;
        for (let u = 0; u <= px; u++) for (let h = -13; h <= H; h++) {
            const P = w.WX(x0, y, u, h);
            let c = (u % 4 === 0) ? C.d2 : (u % 4 === 1 ? C.d4 : C.d3);
            if (h === H) c = C.k; else if (h === H - 1) c = C.d7; else if (h === H - 2) c = C.d5; else if (h === H - 3) c = C.k;
            if (h <= 0) c = (h === -13) ? C.k : (h <= -1 ? ((u % 4 === 0) ? C.d1 : C.d2) : C.k);
            b.set(P[0], P[1], c);
        }
        for (let h = -13; h <= H; h++) { const P = w.WX(x0, y, px, h); b.set(P[0] + 1, P[1], C.k); const Q = w.WX(x0, y, 0, h); b.set(Q[0] - 1, Q[1], C.k); }
    }});
}

function wrap(name, max) {
    const lines = []; let cur = "";
    for (const word of name.split(" ")) {
        if (cur && (cur + " " + word).length > max) { lines.push(cur); cur = word; }
        else cur = cur ? cur + " " + word : word;
    }
    if (cur) lines.push(cur);
    return lines;
}

/* the sign: a sheared plate, its letters stepping down with it but kept upright */
function signX(buf, w, s, sc, oxy) {
    const fine = sc === 2;
    const lines = wrap(s.name, s.max || (fine ? 24 : 18));
    const measure = t => fine ? textW(t, "vb") + 1 : t.length * 4 - 1;
    const tw = Math.max(...lines.map(measure));
    const pad = fine ? 7 : 4, lh = fine ? 11 : 6, PH = lines.length * lh + (fine ? 8 : 4);
    const PW = tw + pad * 2;
    const p0 = w.S(s.x, s.y);
    const sh = s.alongY ? -1 : 1;
    const base = oxy(p0[0], p0[1]);
    const cx = base[0], cy = base[1] - s.h * sc;
    const ink = s.hover ? hex("ffe7a8") : C.b4;
    const bg = s.hover ? hex("4a1c0a") : C.plate;
    /* plate, centred on cx */
    for (let u = 0; u < PW; u++) for (let v = 0; v < PH; v++) {
        const X = cx - (PW >> 1) + u, Y = cy + sh * Math.floor((u - (PW >> 1)) / 2) - v;
        let c = bg;
        const edge = u === 0 || u === PW - 1 || v === 0 || v === PH - 1;
        const rim = u === 1 || u === PW - 2 || v === 1 || v === PH - 2;
        if (edge) c = C.k; else if (fine && rim) c = (v === PH - 2 || u === 1) ? C.b4 : C.b1; else if (!fine && v === PH - 2) c = C.b2;
        buf.set(X, Y, c);
    }
    /* letters */
    lines.forEach((ln, li) => {
        const lw = measure(ln);
        let u = (PW >> 1) - (lw >> 1) - (PW >> 1);
        const topV = PH - (fine ? 5 : 3) - li * lh;
        for (const ch of ln) {
            const Y0 = cy + sh * Math.floor(u / 2) - topV;
            if (fine) {
                const g = VOL.vb[ch] || VOL.vb[" "];
                g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") buf.set(cx + u + i - 1, Y0 + j - 3, ink); });
                u += g.w;
            } else {
                const g = F3[ch] || F3[" "];
                for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === "1") buf.set(cx + u + i, Y0 + j, ink);
                u += 4;
            }
        }
    });
}

function drawSprites(w) { w.sprites.sort((a, b) => a.depth - b.depth).forEach(s => s.draw()); }
function drawPost(w) { for (const s of w.post) if (s.kind === "signX") signX(w.b, w, s, 1, (x, y) => [x, y]); }

/* ---------- lighting moods ---------- */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function lightPass(w, mood, cam) {
    const b = w.b;
    const M = MOODS[mood];
    if (!M) return;
    const lamps = w.lamps.filter(l => !l.dead);
    /* lamp grid for speed */
    const grid = new Map(), G = 256;
    for (const l of lamps) { const k = (l.x / G | 0) + "," + (l.y / G | 0); (grid.get(k) || grid.set(k, []).get(k)).push(l); }
    const camS = cam ? w.S(cam[0], cam[1]) : null;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const p = (y * b.w + x) * 4;
        let r = b.d[p], g = b.d[p + 1], bl = b.d[p + 2];
        if (r < 12 && g < 11 && bl < 14) continue;     // the void stays
        let L = M.ambient, warm = 0, cy = 0;
        const gx = x / G | 0, gy = y / G | 0;
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
            const list = grid.get((gx + c) + "," + (gy + a)); if (!list) continue;
            for (const l of list) {
                const dx = (x - l.x), dy = (y - l.y - 30) * 1.7;
                const d = Math.sqrt(dx * dx + dy * dy) / (M.radius * (l.weak ? .55 : 1));
                if (d < 1) {
                    const f = (1 - d) * (1 - d);
                    if (l.cyan) cy += f * .9; else { L += f * M.power * (l.weak ? .6 : 1); warm += f; }
                }
            }
        }
        if (cam && M.fadeFrom) {
            /* the hall swallows itself the further it runs from where you stand */
            const fx = ((x - w.ox) + 2 * (y - w.oy)) / 32;
            const dd = Math.abs(fx - cam[0]);
            if (dd > M.fadeFrom) L *= Math.max(0, 1 - (dd - M.fadeFrom) / M.fadeLen);
        }
        if (camS && M.own) {
            const dx = x - camS[0], dy = (y - camS[1] + 8) * 1.8;
            const d = Math.sqrt(dx * dx + dy * dy) / M.ownR;
            if (d < 1) L += (1 - d) * M.own;
        }
        /* colour grade */
        let [gr, gg, gb] = M.grade;
        if (M.sallow) {
            const lum = r * .3 + g * .59 + bl * .11;
            r = r + (lum - r) * M.sallow; g = g + (lum - g) * M.sallow; bl = bl + (lum - bl) * M.sallow;
        }
        /* quantise the light with an ordered dither so it stays pixel art */
        const n = M.steps, t = BAYER[(y & 3) * 4 + (x & 3)] / 16;
        const q = Math.floor(L * n + t + 1e-6) / n;
        const qw = Math.floor(Math.min(1, warm) * n + t) / n;
        const qc = Math.floor(Math.min(1, cy) * n + t) / n;
        const mix = 1 - Math.min(1, qw * 1.0);
        const R0 = r * q * (gr * mix + (1.12) * (1 - mix)) + qc * 10;
        const G0 = g * q * (gg * mix + (0.98) * (1 - mix)) + qc * 46;
        const B0 = bl * q * (gb * mix + (0.74) * (1 - mix)) + qc * 58;
        b.d[p] = Math.min(255, R0); b.d[p + 1] = Math.min(255, G0); b.d[p + 2] = Math.min(255, B0);
    }
}
const MOODS = {
    lit: null,
    afterhours: { ambient: .5, power: .95, radius: 165, steps: 6, grade: [.8, .84, 1.1], fadeFrom: 20, fadeLen: 26, own: .5, ownR: 120 },
    forgotten: { ambient: .8, power: .25, radius: 120, steps: 5, grade: [1.0, .96, .66], sallow: .42, fadeFrom: 26, fadeLen: 30 }
};

/* grime for the Forgotten Floor: blotches on carpet and wall, in pixel blocks */
function grime(w, seed) {
    const b = w.b; let s = seed || 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const blots = [];
    for (let i = 0; i < w.cfg.L * .42; i++) blots.push({ x: rnd() * w.cfg.L, y: rnd() * w.cfg.W, r: 14 + rnd() * 26 });
    for (const bl of blots) {
        const a = w.S(bl.x, bl.y);
        for (let j = -bl.r; j <= bl.r; j++) for (let i = -bl.r * 2; i <= bl.r * 2; i++) {
            const X = Math.round(a[0] + i), Y = Math.round(a[1] + j);
            if (X < 0 || Y < 0 || X >= b.w || Y >= b.h || !w.floorMask[Y * b.w + X]) continue;
            const d = (i * i) / (4 * bl.r * bl.r) + (j * j) / (bl.r * bl.r);
            const n = BAYER[(Y & 3) * 4 + (X & 3)] / 16;
            if (d + n * .5 < .85) { const k = b.get(X, Y); b.set(X, Y, [k[0] * .8, k[1] * .78, k[2] * .62]); }
        }
    }
}

/* ---------- a whole hallway ---------- */
function clean(n) { return n.replace(/[^\x20-\x7e]/g, "").replace(/\*/g, "").replace(/\[|\]/g, "").trim().replace(/\s+/g, " "); }
function names() {
    const raw = fs.readFileSync(R + "tools/.cache/maze-list.txt", "utf8").split(/\r?\n/).filter(Boolean).map(l => clean(l.split("\t")[1]).toUpperCase());
    return raw.sort((a, c) => a.replace(/[^A-Z0-9]/g, "").localeCompare(c.replace(/[^A-Z0-9]/g, "")));
}

function build(cfg) {
    /* cfg: layout "both" | "cross" | "far"; mood; avatar placement */
    const list = names();
    const BAY = 6, W = cfg.W || 12;
    let L, cross = [], A = 0, CL = 0, far = [], near = [], tele = [];
    const openIdx = cfg.open;
    if (cfg.layout === "far") {
        /* every door on the far wall, a booth bay every 10 doors */
        let x = 6, n = 0;
        for (const nm of list) {
            far.push({ x, name: nm }); x += BAY; n++;
            if (n % 10 === 0 && n < list.length) { tele.push({ x: x + 2, y: 0 }); x += BAY; }
        }
        L = x + 4;
    } else if (cfg.layout === "both") {
        let x = 6, i = 0, n = 0;
        while (i < list.length) {
            far.push({ x, name: list[i++] });
            if (i < list.length) near.push({ x, name: list[i++] });
            x += BAY; n++;
            if (n % 7 === 0) { tele.push({ x: x + 2, y: 0 }); x += BAY; }
        }
        L = x + 4;
    } else {
        /* crossings every 5 pairs */
        A = 7; CL = 16;
        let x = 6, i = 0, n = 0;
        while (i < list.length) {
            far.push({ x, name: list[i++] });
            if (i < list.length) near.push({ x, name: list[i++] });
            x += BAY; n++;
            if (n % 5 === 0 && i < list.length) { cross.push(x); x += CL + 2; }
        }
        L = x + 4;
    }
    const w = new World({ L, W, A, C: CL, cross, void: cfg.void });
    w.far = far; w.near = near; w.L = L; w.cross = cross; w.tele = tele;

    /* ---- what stands in the hall, gathered first so each layer can be drawn in turn ---- */
    tele.forEach(t => {
        booth(w, t.x, t.y);
        w.post.push({ kind: "signX", x: t.x + .5, y: 0, h: 80, name: "TELEPORT" });
    });
    cross.forEach(c => {
        booth(w, c + 7, -A); booth(w, c + 9, -A);
        (w.recessPost = w.recessPost || []).push({ kind: "signX", x: c + 8.5, y: -A, h: 80, name: "TELEPORTS" });
    });
    const sofaRow = (x, y) => { furni(w, ["hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"], x, y, { flip: true }); furni(w, "hw_sofa2_a_0_2_0", x + 1, y, { flip: true }); furni(w, "hw_sofa1_a_0_2_0", x + 2, y, { flip: true }); };
    if (cfg.dress !== false) {
        far.forEach((d, i) => {
            if (i % 4 === 1) furni(w, "hw_plant_a_0_0_0", d.x + 3, 0);
            if (i % 4 === 3) furni(w, "hw_ero1_a_0_0_0", d.x + 3, 0);
        });
        cross.forEach(c => {
            sofaRow(c + 2, -A); sofaRow(c + 11, -A);
            furni(w, "hw_plant_a_0_0_0", c + 1, -A);
            furni(w, "hw_plant_a_0_0_0", c + 14, -A);
            furni(w, "hw_statue_a_0_0_0", c + 1, W + A - 2);
            furni(w, "hw_statue_a_0_0_0", c + 14, W + A - 2);
        });
    }

    /* near side: doorways and a low wall between them, broken at the crossings */
    {
        const stops = [...near.map(d => [d.x - 1, d.x + 3]), ...cross.map(c => [c, c + CL])].sort((p, q) => p[0] - q[0]);
        if (cfg.layout !== "far" || true) {
            let last = 0;
            for (const st of stops) { rail(w, last, st[0]); last = st[1]; }
            rail(w, last, L);
        }
        near.forEach(d => nearFrame(w, d.x, { name: d.name }));
    }
    if (cfg.avatar && !cfg.noActor) avatar(w, cfg.avatar.who || "m1", cfg.avatar.x, cfg.avatar.y, cfg.avatar.dir, cfg.avatar.row);

    /* ---- recess: its walls, floor and furniture all sit behind the long wall ---- */
    for (const c of cross) {
        wallRunX(w, c, c + CL, -A);
        wallRunY(w, c, -A, 0);
        lamp(w, c + 5, -A, { dead: !!cfg.deadEvery }); lamp(w, c + 11, -A);
    }
    floorPass(w, (X, Y) => Y < 0);
    (w.recess || []).sort((a, c) => a.depth - c.depth).forEach(s => s.draw());
    if (!cfg.noPost) (w.recessPost || []).forEach(s => signX(w.b, w, s, 1, (x, y) => [x, y]));

    /* ---- the long wall ---- */
    let from = 0;
    for (const c of [...cross, L]) { wallRunX(w, from, c, 0); from = c + CL; }
    wallRunY(w, 0, 0, W);
    door(w, 0, Math.floor(W / 2) + 1, { mapY: true, name: "BACK TO THE ARCHIVE" });

    far.forEach((d, i) => {
        door(w, d.x, 0, { name: d.name, open: openIdx === i, hover: cfg.hover === i, pal: cfg.pal });
        const dead = cfg.deadEvery && ((i * 7 + 3) % cfg.deadEvery === 0);
        lamp(w, d.x - 1, 0, { dead: !!dead, weak: !!(cfg.deadEvery && (i * 5) % 4 === 0) });
    });
    floorPass(w, (X, Y) => Y >= 0);
    edgePass(w);
    mats(w);
    if (cfg.grime) grime(w);
    if (cfg.hiliter) { const a = w.S(cfg.hiliter[0], cfg.hiliter[1]); w.b.blit(piece("hiliter_pub"), a[0] - 16, a[1]); }
    drawSprites(w);
    lightPass(w, cfg.mood || "lit", cfg.cam);
    if (!cfg.noPost) drawPost(w);
    return w;
}

function view(w, cx, cy, vw, vh) {
    const c = w.S(cx, cy);
    return w.b.crop(c[0] - (vw >> 1), c[1] - (vh >> 1), vw, vh);
}

module.exports = { pleatedShade, Buf, World, build, view, text, textW, hex, names, piece, load, signX, S, R, C, wrap, door, lamp, furni, wallRunX, wallRunY, modPx, acrossMap, BAYER, REG, clean, F3, VOL };

} };
MODULES["hw2.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* Second pass: the hallway as stacked floors filling the page. Doors only on the
   two walls you can see. Each floor is rendered on its own, recoloured and lit on
   its own, then laid over the floor above it. */
const fs = require("fs");
const H = require("./hw.js");
const { Buf, hex, piece, load, C, modPx, acrossMap, BAYER } = H;
const { readPng } = require(H.R + "tools/png-decode.js");
const AVD = H.S + "/av/", TELE = H.S + "/tele/hh_furni_special_50/";
const VOID = [7, 6, 10];
H.names2 = () => fs.readFileSync(H.R + "tools/.cache/maze-list.txt", "utf8").split(/\r?\n/).filter(Boolean).map(l => H.clean(l.split("\t")[1])).sort((a, c) => a.replace(/[^A-Za-z0-9]/g, "").toLowerCase().localeCompare(c.replace(/[^A-Za-z0-9]/g, "").toLowerCase()));

/* ---- real client teleports ---- */
const TREG = JSON.parse(fs.readFileSync(H.S + "/regs.json", "utf8")).tele;
function teleport(w, kind, tx, ty, o) {
    /* The Imperial Teleport, s_doorD. Direction 4 faces +y; flipped, it faces +x for the other wall. */
    o = o || {};
    w.sprites.push({ depth: tx + ty + .9, draw: () => {
        const a = w.S(tx, ty), loc = [a[0] - 16, a[1] + 8];
        const parts = o.open ? ["c", "b", "a"] : ["b"];
        for (const p of parts) {
            const n = `s_${kind}_${p}_0_1_1_4_${o.open ? 1 : 0}`;
            const im = load(TELE + n + ".png"), reg = TREG[n];
            const x0 = o.flip ? loc[0] + 32 + reg[0] - im.w : loc[0] - reg[0];
            w.b.blit(im, x0, loc[1] - reg[1], { flip: o.flip });
        }
    }});
    const p = w.S(tx, ty);
    w.lamps.push({ x: p[0], y: p[1] - 30, tele: true });
}

/* ---- tiles drawn directly, so a floor or a step can sit at any height ---- */
const straight = piece("floor_mat_straight"), crossPc = piece("floor_mat_middle_crossroad"), plain = piece("floor_plain_tiles");
const m4 = v => ((v % 4) + 4) % 4;
function tile(w, X, Y, sample, lift) {
    const a = w.S(X, Y);
    for (let dy = 0; dy < 16; dy++) {
        const half = dy < 8 ? dy * 2 + 2 : (15 - dy) * 2 + 2;
        for (let dx = -half; dx <= half; dx++) {
            const c = sample(dx, dy);
            if (c) w.b.set(a[0] + dx, a[1] + dy - (lift || 0), c);
        }
    }
}
function floorSample(w, X, Y) {
    const W = w.W, plainS = (dx, dy) => modPx(plain, false, 2 + m4(X), 2 + m4(Y), dx, dy);
    const runX = my => my === null ? plainS : (dx, dy) => modPx(straight, true, 2 + m4(X), my, dx, dy);
    const runY = my => my === null ? plainS : (dx, dy) => modPx(straight, false, my, 2 + m4(Y), dx, dy);
    if (w.chevron && X < W && Y < W) {
        const ma = X - (W - 4) / 2 - 1, mb = Y - (W - 4) / 2 - 1;
        if (ma >= 0 && ma < 4 && mb >= 0 && mb < 4) return (dx, dy) => modPx(crossPc, false, 2 + ma, 2 + mb, dx, dy);
        const a = Math.min(X, Y);
        const my = a < 2 ? null : a < 5 ? a - 2 : 4;
        return X <= Y ? runY(my) : runX(my);
    }
    if (w.chevron && Y >= W) return runY(acrossMap(X, W));
    return runX(acrossMap(Y, W));
}

/* ---- stairs: a flight rising 16px a tile, carpet running up it, brass on every nosing ---- */
const RISE = 16;
function stairsX(w, a) {
    /* on the wing along x: climbs toward -y, from y=7 up to the floor above at y=0 */
    const WD = 6, N = 7, b = w.b;
    for (let Y = 0; Y < N; Y++) {
        const e = (N - Y) * RISE;
        for (let i = 0; i < WD; i++) tile(w, a + i, Y, (dx, dy) => modPx(straight, false, i + 1, 2 + m4(Y), dx, dy), e);
        /* the riser under this step's front edge */
        for (let u = 0; u < WD * 16; u++) for (let h = 0; h < RISE; h++) {
            const P = w.WX(a, Y + 1, u, e - h);
            const inRun = u >= 16 && u < WD * 16 - 16;
            let c = inRun ? ((u & 1) ? hex("510000") : hex("730000")) : ((u >> 1) % 4 === 0 ? C.d2 : C.d3);
            if (h === 0) c = C.b4; else if (h === 1) c = C.b2; else if (h === 2 || h === RISE - 1) c = C.k;
            b.set(P[0], P[1], c);
        }
    }
    /* the visible side of the flight, and a rail along each side */
    for (let v = 0; v <= N * 16; v++) {
        const top = Math.ceil(v / 16) * RISE;
        for (let h = 0; h <= top; h++) {
            const P = w.WY(a + WD, N, v, h);
            let c = (v >> 1) % 5 === 0 ? C.d2 : C.d3;
            if (h === top) c = C.k; else if (h === top - 1) c = C.d6; else if (h === 0) c = C.k;
            b.set(P[0], P[1], c);
        }
    }
    for (const side of [0, WD]) for (let v = 0; v <= N * 16; v++) {
        const hh = Math.round(v) + 16;
        const P = w.WY(a + side, N, v, hh);
        b.set(P[0], P[1], C.k); b.set(P[0], P[1] + 1, C.b4); b.set(P[0], P[1] + 2, C.b2); b.set(P[0], P[1] + 3, C.k);
        if (v % 16 === 8) for (let h = 0; h < 15; h++) { const Q = w.WY(a + side, N, v, hh - 3 - h); b.set(Q[0], Q[1], C.b1); b.set(Q[0] + 1, Q[1], C.k); }
    }
}
function stairsY(w, a) {
    /* on the wing along y: climbs toward -x, from x=7 up to the floor above at x=0 */
    const WD = 6, N = 7, b = w.b;
    for (let X = 0; X < N; X++) {
        const e = (N - X) * RISE;
        for (let i = 0; i < WD; i++) tile(w, X, a + i, (dx, dy) => modPx(straight, true, 2 + m4(X), i + 1, dx, dy), e);
        for (let u = 0; u < WD * 16; u++) for (let h = 0; h < RISE; h++) {
            const P = w.WY(X + 1, a + WD, u, e - h);
            const inRun = u >= 16 && u < WD * 16 - 16;
            let c = inRun ? ((u & 1) ? hex("510000") : hex("730000")) : ((u >> 1) % 4 === 0 ? C.d2 : C.d3);
            if (h === 0) c = C.b4; else if (h === 1) c = C.b2; else if (h === 2 || h === RISE - 1) c = C.k;
            b.set(P[0], P[1], c);
        }
    }
    for (let v = 0; v <= N * 16; v++) {
        const top = Math.ceil(v / 16) * RISE;
        for (let h = 0; h <= top; h++) {
            const P = w.WX(N, a + WD, -v, h);
            const fix = [P[0], w.S(N, a + WD)[1] + Math.floor(-v / -2) * -1 - h];
            let c = (v >> 1) % 5 === 0 ? C.d1 : C.d2;
            if (h === top) c = C.k; else if (h === top - 1) c = C.d5; else if (h === 0) c = C.k;
            b.set(fix[0], fix[1], c);
        }
    }
    for (const side of [0, WD]) for (let v = 0; v <= N * 16; v++) {
        const hh = v + 16, base = w.S(N, a + side);
        const x = base[0] - v, y = base[1] - Math.floor(v / 2) - hh;
        b.set(x, y, C.k); b.set(x, y + 1, C.b4); b.set(x, y + 2, C.b2); b.set(x, y + 3, C.k);
        if (v % 16 === 8) for (let h = 0; h < 15; h++) { b.set(x, y + 3 + h, C.b1); b.set(x + 1, y + 3 + h, C.k); }
    }
}

/* ---- low walls along the near edges ---- */
function railX(w, x0, x1, y) {
    if (x1 <= x0) return;
    const R = 15, px = (x1 - x0) * 16;
    for (let u = 0; u <= px; u++) for (let h = 0; h <= R; h++) {
        const P = w.WX(x0, y, u, h);
        let c = (u % 4 === 0) ? C.d2 : (u % 4 === 1 ? C.d4 : C.d3);
        if (h === R) c = C.k; else if (h === R - 1) c = C.d7; else if (h === R - 2) c = C.d5; else if (h === R - 3) c = C.k;
        w.b.set(P[0], P[1], c);
    }
}
function railY(w, x, y0, y1) {
    if (y1 <= y0) return;
    const R = 15, px = (y1 - y0) * 16;
    for (let u = 0; u <= px; u++) for (let h = 0; h <= R; h++) {
        const P = w.WY(x, y1, u, h);
        let c = (u % 4 === 0) ? C.d1 : (u % 4 === 1 ? C.d3 : C.d2);
        if (h === R) c = C.k; else if (h === R - 1) c = C.d6; else if (h === R - 2) c = C.d4; else if (h === R - 3) c = C.k;
        w.b.set(P[0], P[1], c);
    }
}
function mat(w, x, y, alongY) {
    for (let t = 0; t < 32; t++) for (let v = 0; v < 18; v++) {
        const a = alongY ? w.S(x, y - 2) : w.S(x, y);
        /* t along the wall, v out from it */
        const sx = alongY ? a[0] - t + v : a[0] + t - v;
        const sy = a[1] + Math.floor(t / 2) + Math.floor(v / 2);
        let c = (t + v) % 2 ? hex("3a0a12") : hex("4c1018");
        if (v === 0 || v === 17 || t < 1 || t > 30) c = C.k;
        else if (v === 1 || v === 16 || t < 2 || t > 29) c = C.b3;
        else if (v === 3 || v === 14 || t === 3 || t === 28) c = hex("6e1a14");
        w.b.set(sx, sy, c); w.b.set(alongY ? sx + 1 : sx - 1, sy, c);
    }
}
const identity = (x, y) => [x, y];

/* ---- colourways: exact client colours swapped, group by group ---- */
const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const fromHsl = ([h, s, l]) => { h = ((h % 360) + 360) % 360 / 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255].map(Math.round); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255)); };
const colours = n => { const im = piece(n), out = new Set(); for (let i = 0; i < im.rgba.length; i += 4) if (im.rgba[i + 3] > 128) out.add((im.rgba[i] << 16) | (im.rgba[i + 1] << 8) | im.rgba[i + 2]); return out; };
const GROUPS = (() => {
    const parquet = colours("floor_plain_tiles");
    const low = colours("wall_lower_left");
    const carpet = new Set([...colours("floor_mat_straight"), ...colours("floor_mat_middle_crossroad"), ...colours("floor_mat_upper_crossroad")].filter(c => !parquet.has(c)));
    const wall = colours("wall_upper_right_basic");
    const g = new Map();
    const hx = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    for (const c of parquet) if (c) g.set(c, "parquet");
    for (const c of low) if (c) g.set(c, "wood");
    for (const k of ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"]) { const v = C[k]; g.set((v[0] << 16) | (v[1] << 8) | v[2], "wood"); }
    for (const c of wall) { if (!c || g.has(c)) continue; const [h] = toHsl(hx(c)); g.set(c, (h > 55 && h < 240) ? "paperB" : "paperA"); }
    for (const c of carpet) if (c) g.set(c, "carpet");
    return g;
})();
/* each group: [hue, saturation multiplier, lightness multiplier]; no entry leaves it as the client has it */
const WAYS = {
    crimson: { label: "Crimson (the client's)" },
    royal: { label: "Royal blue", carpet: [224, 1.0, 1.15], paperA: [46, .75, 1.0], paperB: [222, .9, .85], wood: [24, .7, .8] },
    emerald: { label: "Emerald", carpet: [150, .95, 1.05], paperA: [52, .5, 1.15], paperB: [152, .75, .85], wood: [28, .6, .75] },
    plum: { label: "Plum", carpet: [292, .85, 1.15], paperA: [330, .55, 1.0], paperB: [268, .55, .85], wood: [340, .45, .7] },
    teal: { label: "Deep teal", carpet: [186, .9, 1.05], paperA: [172, .3, 1.05], paperB: [195, .55, .75], wood: [200, .25, .6], parquet: [36, .45, .9] },
    mustard: { label: "Mustard 70s", carpet: [38, 1.0, 1.35], paperA: [24, .8, .95], paperB: [90, .35, .9], wood: [30, .8, .8] },
    ghost: { label: "Ghost grey", carpet: [350, .14, 1.45], paperA: [40, .08, 1.05], paperB: [200, .08, .95], wood: [30, .12, .85], parquet: [40, .12, .85] },
    bubblegum: { label: "Sugar pink", carpet: [334, .8, 1.7], paperA: [340, .6, 1.2], paperB: [190, .4, 1.15], wood: [10, .35, 1.05], parquet: [30, .5, 1.1] }
};
function recolour(b, name) {
    const W = WAYS[name];
    if (!W || name === "crimson") return;
    const memo = new Map();
    for (let p = 0; p < b.d.length; p += 4) {
        const c = (b.d[p] << 16) | (b.d[p + 1] << 8) | b.d[p + 2];
        let m = memo.get(c);
        if (m === undefined) {
            const g = GROUPS.get(c), spec = g && W[g];
            if (spec) { const [, s, l] = toHsl([b.d[p], b.d[p + 1], b.d[p + 2]]); m = fromHsl([spec[0], Math.min(1, s * spec[1]), Math.min(.96, l * spec[2])]); }
            else m = null;
            memo.set(c, m);
        }
        if (m) { b.d[p] = m[0]; b.d[p + 1] = m[1]; b.d[p + 2] = m[2]; }
    }
}

/* ---- ambient lighting: three channels, stepped and dithered so it stays pixel art ---- */
const LIGHTS = {
    full: null,
    warm: { label: "Warm sconces", amb: [.62, .6, .6], lamp: () => [1.0, .72, .38], r: 165, p: .8, steps: 8 },
    midnight: { label: "After midnight", amb: [.26, .3, .46], lamp: i => i % 4 === 2 ? null : [1.15, .78, .42], r: 175, p: 1.05, steps: 8, own: .55, ownR: 125 },
    neon: { label: "Neon hum", amb: [.26, .2, .38], lamp: i => i % 2 ? [1.25, .28, .85] : [.2, .95, 1.2], r: 165, p: 1.1, steps: 8, own: .3, ownR: 105 },
    moon: { label: "Moonlight", amb: [.24, .3, .48], lamp: i => i % 5 === 0 ? [.95, .7, .4] : null, r: 150, p: .8, steps: 8, shafts: [.55, .7, 1.05], own: .3, ownR: 105 },
    backrooms: { label: "Fluorescent hum", amb: [.74, .72, .46], lamp: i => i % 5 === 3 ? null : [.5, .52, .3], r: 130, p: .55, steps: 8, sallow: .4 },
    emergency: { label: "Emergency power", amb: [.3, .1, .1], lamp: i => i % 3 === 0 ? [1.3, .22, .12] : null, r: 215, p: 1.2, steps: 8, own: .35, ownR: 105 }
};
function light(w, b, name, cam, dim) {
    const M = LIGHTS[name];
    if (!M && !dim) return;
    const lamps = M ? w.lamps.map((l, i) => { const c = l.tele ? [.35, .7, 1] : M.lamp(i); return c ? { ...l, c } : null; }).filter(Boolean) : [];
    const n = M ? M.steps : 8;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const p = (y * b.w + x) * 4;
        if (b.d[p] === VOID[0] && b.d[p + 1] === VOID[1] && b.d[p + 2] === VOID[2]) continue;
        let L = M ? [...M.amb] : [1, 1, 1];
        for (const l of lamps) {
            const dx = x - l.x; if (dx > M.r || dx < -M.r) continue;
            const dy = (y - l.y - 34) * 1.6; if (dy > M.r || dy < -M.r) continue;
            const d = Math.sqrt(dx * dx + dy * dy) / M.r;
            if (d < 1) { const f = (1 - d) * (1 - d) * M.p; L[0] += f * l.c[0]; L[1] += f * l.c[1]; L[2] += f * l.c[2]; }
        }
        if (M && M.shafts) {
            /* slanted bars of moonlight, in floor coordinates */
            const fx = ((x - w.ox) + 2 * (y - w.oy)) / 32, fy = (2 * (y - w.oy) - (x - w.ox)) / 32;
            const s = (fx + fy * .6);
            if (((s % 11) + 11) % 11 < 2.2) { L[0] += M.shafts[0]; L[1] += M.shafts[1]; L[2] += M.shafts[2]; }
        }
        if (M && M.own && cam) {
            const dx = x - cam[0], dy = (y - cam[1] + 20) * 1.5;
            const d = Math.sqrt(dx * dx + dy * dy) / M.ownR;
            if (d < 1) { const f = (1 - d) * M.own; L[0] += f; L[1] += f; L[2] += f; }
        }
        if (dim) L = L.map(v => v * dim);
        let r = b.d[p], g = b.d[p + 1], bl = b.d[p + 2];
        if (M && M.sallow) { const lum = r * .3 + g * .59 + bl * .11; r += (lum - r) * M.sallow; g += (lum - g) * M.sallow; bl += (lum - bl) * M.sallow; }
        const t = BAYER[(y & 3) * 4 + (x & 3)] / 16;
        const q = v => Math.floor(v * n + t + 1e-6) / n;
        b.d[p] = Math.min(255, r * q(L[0])); b.d[p + 1] = Math.min(255, g * q(L[1])); b.d[p + 2] = Math.min(255, bl * q(L[2]));
    }
}

/* ---- avatars ---- */
function avatarFile(size, dir, action, frame) { return load(`${AVD}${size}-${dir}-${action}-${frame}.png`); }

/* ---- the building ---- */
function build(cfg) {
    const shape = cfg.shape || "chevron", chevron = shape === "chevron", W = cfg.W || 14, STOREY = 114;
    const LX = chevron ? 80 : 170, LY = chevron ? 80 : 0;
    const top = cfg.top === undefined ? -4 : cfg.top, bot = cfg.bot === undefined ? 5 : cfg.bot;
    const REAL = [2, 1, 0];     // floor index by level: level 2 is the ground, you climb from there
    const stepY = chevron ? 16 * W + STOREY : 8 * W + STOREY, stepX = chevron ? 0 : -16 * W;
    const span = (LX + LY + W + 8) * 16;
    const terraceOx = (bot + 2) * 16 * W;
    const pw = chevron ? (LX + 8) * 32 + 60 : terraceOx + (-top) * 16 * W + LX * 16 + 300;
    const ph = (LX + LY) * 8 + stepY * (bot - top + 1) + 500;
    const ox0 = chevron ? pw >> 1 : terraceOx, oy0 = 200 - top * stepY;
    const master = new Buf(pw, ph, "07060a");
    const w = {
        W, chevron, ox: 0, oy: 0, b: null, lamps: [], sprites: [],
        S(x, y) { return [Math.round((x - y) * 16) + this.ox, Math.round((x + y) * 8) + this.oy]; },
        WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; },
        WY(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] - Math.floor(u / 2) - h]; }
    };
    const origin = n => [ox0 + (n * stepX), oy0 + n * stepY];
    const at = (n, x, y) => { const o = origin(n); return [Math.round((x - y) * 16) + o[0], Math.round((x + y) * 8) + o[1]]; };
    /* split the 39 mazes over three real floors */
    const names = H.names2();
    const perFloor = 13;
    const floors = { 2: names.slice(0, 13), 1: names.slice(13, 26), 0: names.slice(26) };
    const DX = chevron ? [3, 10, 27, 34, 41, 48, 55] : [2, 9, 16, 33, 40, 47, 54, 67, 74, 81, 88, 95, 102];
    const DY = chevron ? [5, 12, 29, 36, 43, 50] : [];
    const STAIR = chevron ? 16 : 23;
    const camPx = cfg.avatar ? at(cfg.avatar.n, cfg.avatar.x, cfg.avatar.y) : null;
    const layer = new Buf(pw, ph, "07060a");

    for (let n = top; n <= bot; n++) {
        const o = origin(n);
        w.ox = o[0]; w.oy = o[1]; w.lamps = []; w.sprites = []; w.mats = [];
        layer.d.fill(0);
        for (let i = 0; i < layer.d.length; i += 4) { layer.d[i] = VOID[0]; layer.d[i + 1] = VOID[1]; layer.d[i + 2] = VOID[2]; layer.d[i + 3] = 255; }
        w.b = layer;
        const real = floors[n];
        const seqX = real ? real.slice(0, 7) : [], seqY = real ? real.slice(7) : [];

        /* walls */
        H.wallRunX(w, 0, LX, 0);
        H.wallRunY(w, 0, 0, chevron ? LY : W);

        /* floor */
        for (let Y = 0; Y < (chevron ? LY : W); Y++) for (let X = 0; X < LX; X++) {
            if (chevron && X >= W && Y >= W) continue;
            const smp = floorSample(w, X, Y);
            tile(w, X, Y, smp);
        }
        /* slab edges */
        const pal = ["000000", "c79556", "b1804a", "9d7146", "9d7146", "895e39", "000000", "895e39", "4d2312", "895e39", "4d2312", "000000"].map(hex);
        const slab = (fn, len) => { for (let u = 0; u <= len; u++) pal.forEach((c, d) => { const P = fn(u, -1 - d); layer.set(P[0], P[1], d >= 1 && d <= 5 && ((u >> 1) & 3) === 0 ? c.map(v => v * .86 | 0) : c); }); };
        if (chevron) {
            slab((u, h) => w.WX(W, W, u, h), (LX - W) * 16);
            slab((u, h) => w.WY(W, LY, u, h), (LY - W) * 16);
        } else slab((u, h) => w.WX(0, W, u, h), LX * 16);
        slab((u, h) => w.WY(LX, W, u, h), W * 16);

        /* doors, lamps, signs on the two visible walls only */
        const pending = [];
        DX.forEach((x, i) => {
            const name = seqX[i];
            H.door(w, x, 0, { open: cfg.open && cfg.open[0] === n && cfg.open[1] === "x" && cfg.open[2] === i, hover: cfg.hover && cfg.hover[0] === n && cfg.hover[1] === "x" && cfg.hover[2] === i });
            mat(w, x, 0, false);
            H.lamp(w, x + 5.5, 0, {});
            if (name) pending.push({ x: x + 1, y: 0, h: 34, name, max: 17, hover: cfg.hover && cfg.hover[0] === n && cfg.hover[1] === "x" && cfg.hover[2] === i });
        });
        if (chevron) DY.forEach((y, i) => {
            const name = seqY[i];
            H.door(w, 0, y, { mapY: true });
            mat(w, 0, y, true);
            H.lamp(w, 0, y + 3.5, { mapY: true });
            if (name) pending.push({ x: 0, y: y - 1, h: 34, name, max: 17, alongY: true });
        });
        /* the flights up to the floor above */
        if (n > top) { stairsX(w, STAIR); if (chevron) stairsY(w, STAIR); }
        const upper = floors[n - 1];
        if (upper) {
            const lab = `Up to Floor ${3 - (n - 1)} (${upper[0][0].toUpperCase()} to ${upper[upper.length - 1][0].toUpperCase()})`;
            pending.push({ x: STAIR + 6, y: 2.5, h: 6, name: lab, max: 13, alongY: true });
            if (chevron) pending.push({ x: 2.5, y: STAIR + 6, h: 6, name: lab, max: 13 });
        }

        /* scenery, including the real teleports either side of each flight */
        const kind = "doorD";
        if (!cfg.noTele) { teleport(w, kind, STAIR + 8, 0); if (chevron) teleport(w, kind, 0, STAIR + 8, { flip: true }); }
        DX.forEach((x, i) => { if (i % 2 === 1 && x + 4 > STAIR + 6) H.furni(w, "hw_plant_a_0_0_0", x + 4, 0); });
        if (chevron) {
            H.furni(w, "hw_statue_a_0_0_0", 0, 0, {});
            const sofa = (x) => { H.furni(w, ["hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"], x, 0, { flip: true }); H.furni(w, "hw_sofa2_a_0_2_0", x + 1, 0, { flip: true }); H.furni(w, "hw_sofa1_a_0_2_0", x + 2, 0, { flip: true }); };
            sofa(61);
        }
        if (cfg.avatar && cfg.avatar.n === n && cfg.avatarS) {
            const a = cfg.avatar;
            w.sprites.push({ depth: a.x + a.y + .5, draw: () => {
                const im = avatarFile("s", a.dir, a.action || "std", a.frame || 0), P = w.S(a.x, a.y);
                layer.blit(im, P[0] - 16, P[1] + 8 - (im.h - 6));
            }});
        }
        w.sprites.sort((p, q) => p.depth - q.depth).forEach(s => s.draw());

        /* the low wall on the near edges, broken where a flight comes up from below */
        const gapX = n < bot ? [STAIR + (chevron ? W : 0), STAIR + (chevron ? W : 0) + 6] : null;
        if (chevron) {
            railX(w, W, gapX ? gapX[0] : LX, W); if (gapX) railX(w, gapX[1], LX, W);
            railY(w, W, W, gapX ? gapX[0] : LY); if (gapX) railY(w, W, gapX[1], LY);
        } else {
            railX(w, 0, gapX ? gapX[0] : LX, W); if (gapX) railX(w, gapX[1], LX, W);
        }

        /* colour, light, then the signs which stay readable under any light */
        const way = (cfg.waysByFloor && cfg.waysByFloor[((n % cfg.waysByFloor.length) + cfg.waysByFloor.length) % cfg.waysByFloor.length]) || cfg.way || "crimson";
        recolour(layer, way);
        const dim = cfg.floorDim ? (n === (cfg.avatar ? cfg.avatar.n : 1) ? 0 : cfg.floorDim) : 0;
        light(w, layer, cfg.light || "full", n === (cfg.avatar && cfg.avatar.n) ? camPx : null, dim || (LIGHTS[cfg.light] && real === undefined ? .7 : 0));
        for (const s of pending) H.signX(layer, w, s, 2, identity);

        /* over the floor above */
        for (let p = 0; p < layer.d.length; p += 4) {
            if (layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]) continue;
            master.d[p] = layer.d[p]; master.d[p + 1] = layer.d[p + 1]; master.d[p + 2] = layer.d[p + 2];
        }
    }
    return { b: master, at, cfg };
}

function shot(world, px, py, vw, vh, zoom, o) {
    /* zoom 1: 1:1. zoom 2: doubled. full: Scale2x. Zoomed views get the real m-size Habbo. */
    o = o || {};
    const qw = Math.ceil(vw / zoom), qh = Math.ceil(vh / zoom);
    const cx = px - (qw >> 1), cy = py - (qh >> 1);
    const raw = world.b.crop(cx, cy, qw, qh);
    let out;
    if (zoom === 1) out = raw;
    else if (o.full) out = raw.scale2x();
    else { out = new Buf(qw * zoom, qh * zoom); out.paste(raw, 0, 0, zoom); }
    const a = world.cfg.avatar;
    if (a && zoom === 2 && !world.cfg.avatarS) {
        const im = avatarFile("m", a.dir, a.action || "std", a.frame || 0), P = world.at(a.n, a.x, a.y);
        const fx = (P[0] - cx) * 2, fy = (P[1] + 8 - cy) * 2;
        for (let j = -5; j <= 5; j++) for (let i = -18; i <= 18; i++) if (i * i / 324 + j * j / 25 < 1 && (i + j) % 2 === 0) { const X = fx + i, Y = fy + j; if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.set(X, Y, out.get(X, Y).map(v => v * .55)); }
        const M = LIGHTS[world.cfg.light];
        const f = M ? (M.own ? M.amb.map(v => Math.min(1.05, v + M.own + .28)) : M.amb.map(v => Math.min(1.05, v + .3))) : [1, 1, 1];
        const x0 = fx - (im.w >> 1), y0 = fy - im.h + 11;
        for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; out.set(x0 + i, y0 + j, [Math.min(255, im.rgba[q] * f[0]), Math.min(255, im.rgba[q + 1] * f[1]), Math.min(255, im.rgba[q + 2] * f[2])]); }
    }
    return out;
}

module.exports = { build, shot, teleport, WAYS, LIGHTS, Buf, H, TELE, TREG, avatarFile, mat, railX, railY };

} };
MODULES["hw3.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* Third pass: a real floor plan. Every floor is a set of rectangles at a height; walls,
   slab edges and low walls are worked out from which tiles exist. */
const fs = require("fs");
const Parts = require("../furni-parts.js");
const H = require("./hw.js");
const FloorLamps = require("./floor-lamps.js");
const EdgeItems = require("./edge-items.js");
const RopeBarrier = require("./rope-barrier.js");
const WALL_ITEM = new Map(require("../wall-items.js").map(i => [i.id, i]));
const HallWindow = require("./hall-window.js");
const FLOOR_PIECES = (() => { try { return require("../wall-items.js").floor || {}; } catch (e) { return {}; } })();
const glowsAfterDark = c => (c[0] === 46 && c[1] === 224 && c[2] === 124) || (c[0] === 255 && c[1] === 255 && c[2] === 255);
const wallArtCache = new Map(), wallArt = f => { if (!wallArtCache.has(f)) wallArtCache.set(f, H_readPng(require("path").join(__dirname, "../art/wall", f))); return wallArtCache.get(f); };
const H_readPng = require("path").resolve(__dirname, "../../png-decode.js") && require("../../png-decode.js").readPng;
const W2 = require("./hw2.js");
const { Buf, hex, piece, load, C, modPx, acrossMap, BAYER } = H;
const { teleport, avatarFile } = W2;
const VOID = [7, 6, 10];
const straight = piece("floor_mat_straight"), crossPc = piece("floor_mat_middle_crossroad"), plain = piece("floor_plain_tiles");
const m4 = v => ((v % 4) + 4) % 4;

/* ---- rugs ---- */
const RUG = (() => {
    const parquet = new Set(); for (let i = 0; i < plain.rgba.length; i += 4) if (plain.rgba[i + 3] > 128) parquet.add((plain.rgba[i] << 16) | (plain.rgba[i + 1] << 8) | plain.rgba[i + 2]);
    const at = (a, b) => modPx(straight, true, 0, 0, a - b, Math.floor((a + b) / 2));
    const num = c => c ? (c[0] << 16) | (c[1] << 8) | c[2] : -1;
    const core = new Set([0x510000, 0x730000]);
    const line = []; for (let b = 0; b < 128; b++) line.push(at(68, b));
    let s0 = 0; while (s0 < 128 && (!line[s0] || parquet.has(num(line[s0])) )) s0++;
    let e0 = s0; for (let b = s0; b < 64; b++) if (line[b] && !core.has(num(line[b]))) e0 = b + 1;
    e0 += 2;
    return { ramp: [hex("000000"), ...line.slice(s0, e0).filter(Boolean)], core: e0, at };
})();
const CHAMFER = 30;
function rugAt(R, X, Y, dx, dy) {
    const a = Math.floor(X * 16 + (dx + 2 * dy) / 2), b = Math.floor(Y * 16 + (2 * dy - dx) / 2);
    const a0 = R.x0 * 16, a1 = R.x1 * 16, b0 = R.y0 * 16, b1 = R.y1 * 16;
    if (a < a0 || a >= a1 || b < b0 || b >= b1) return null;
    const da = a - a0, db = a1 - 1 - a, dc = b - b0, dd = b1 - 1 - b;
    const r = Math.min(da, db, dc, dd);
    if (r < RUG.ramp.length) return RUG.ramp[r];
    return R.alongY ? RUG.at(68 + (((b % 32) + 32) % 32), RUG.core + (((a % 16) + 16) % 16)) : RUG.at(68 + (((a % 32) + 32) % 32), RUG.core + (((b % 16) + 16) % 16));
}

/* Touching rugs join: the border is worked out from the shape they make together, so it runs round
   the outside of the whole thing, in and out of its corners, and never across a join. */
function rugField(rugs) {
    const set = new Set();
    for (const r of rugs) for (let X = r.x0; X < r.x1; X++) for (let Y = r.y0; Y < r.y1; Y++) set.add(X + "," + Y);
    /* each joined shape's stripes run along its longer side */
    const along = new Map();
    for (const start of set) {
        if (along.has(start)) continue;
        const q = [start], seen = [start]; along.set(start, false);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        while (q.length) {
            const k = q.pop(), [X, Y] = k.split(",").map(Number);
            if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
            for (const n of [(X + 1) + "," + Y, (X - 1) + "," + Y, X + "," + (Y + 1), X + "," + (Y - 1)]) if (set.has(n) && !along.has(n)) { along.set(n, false); q.push(n); seen.push(n); }
        }
        const v = (y1 - y0) > (x1 - x0);
        for (const k of seen) along.set(k, v);
    }
    return { set, along, near: new Map() };
}
function rugFieldAt(F, X, Y, dx, dy) {
    const a = Math.floor(X * 16 + (dx + 2 * dy) / 2), b = Math.floor(Y * 16 + (2 * dy - dx) / 2);
    const TX = Math.floor(a / 16), TY = Math.floor(b / 16), key = TX + "," + TY;
    if (!F.set.has(key)) return null;
    let near = F.near.get(key);
    if (!near) {
        near = []; const R = Math.ceil(RUG.ramp.length / 16);
        for (let i = TX - R; i <= TX + R; i++) for (let j = TY - R; j <= TY + R; j++) if (!F.set.has(i + "," + j)) near.push(i * 16, j * 16);
        F.near.set(key, near);
    }
    let r = 1e9;
    for (let n = 0; n < near.length; n += 2) {
        const ax = near[n], by = near[n + 1];
        const da = a < ax ? ax - a - 1 : a >= ax + 16 ? a - ax - 16 : 0, db = b < by ? by - b - 1 : b >= by + 16 ? b - by - 16 : 0;
        const d = Math.max(da, db);
        if (d < r) r = d;
    }
    if (r < RUG.ramp.length) return RUG.ramp[r];
    return F.along.get(key) ? RUG.at(68 + (((b % 32) + 32) % 32), RUG.core + (((a % 16) + 16) % 16)) : RUG.at(68 + (((a % 32) + 32) % 32), RUG.core + (((b % 16) + 16) % 16));
}

/* ---- muted colourways: group -> [hue, sat x, light x] ---- */
const WAYS = {
    oxblood: { label: "Oxblood", carpet: [356, .5, .95], paperA: [18, .38, .92], paperB: [165, .22, .85], wood: [20, .62, .85], parquet: [34, .62, .92] },
    slate: { label: "Slate", carpet: [216, .24, 1.25], paperA: [36, .22, .95], paperB: [214, .2, .85], wood: [24, .4, .72], parquet: [32, .4, .85] },
    sage: { label: "Sage", carpet: [132, .2, 1.2], paperA: [58, .2, 1.0], paperB: [140, .18, .85], wood: [32, .4, .75], parquet: [40, .42, .9] },
    mauve: { label: "Dusty mauve", carpet: [318, .2, 1.25], paperA: [350, .2, 1.0], paperB: [282, .16, .85], wood: [350, .28, .72], parquet: [30, .34, .85] },
    ochre: { label: "Old ochre", carpet: [34, .42, 1.3], paperA: [28, .38, .95], paperB: [72, .16, .85], wood: [28, .55, .78], parquet: [36, .5, .88] },
    teal: { label: "Faded teal", carpet: [184, .26, 1.15], paperA: [168, .14, 1.05], paperB: [196, .2, .8], wood: [26, .32, .65], parquet: [34, .34, .82] },
    clay: { label: "Clay", carpet: [14, .36, 1.25], paperA: [24, .3, 1.02], paperB: [28, .14, .82], wood: [18, .45, .78], parquet: [28, .42, .9] },
    ash: { label: "Ash", carpet: [350, .08, 1.5], paperA: [40, .06, 1.05], paperB: [200, .06, .92], wood: [30, .1, .8], parquet: [40, .1, .85] }
};
const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const fromHsl = ([h, s, l]) => { h = ((h % 360) + 360) % 360 / 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255].map(Math.round); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255)); };
/* A floor's own colour: one pick changes that floor's main colour, and nothing else. The carpet takes it, and so does the wallpaper's
   darker stripe, kept muted so it sits on the wall as the green does. The light stripe, the wood and the parquet stay as they are on the
   standard floor, so every floor still belongs to the same building. */
const REF = { carpet: "730000", paperA: "be5d44", paperB: "38504f", wood: "712f16", parquet: "b2814b" };
const specFor = (group, h, s, l) => { const [, rs, rl] = toHsl(hex(REF[group])); return [h, s / (rs || 1), l / (rl || 1)]; };
const mixHue = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };
/* Ash, in the Glukko Arms' colours: smoke-and-aubergine stone for the paper, near-black timber, moss green for the carpet, and a floor of thick dark oak planks */
{
    const aim = (group, code) => { const [h, s, l] = toHsl(hex(code)); return specFor(group, h, s, l); };
    Object.assign(WAYS.ash, { carpet: aim("carpet", "1c2610"), paperA: aim("paperA", "4d4852"), paperB: aim("paperB", "2c2a33"), wood: aim("wood", "2a2320"), parquet: aim("parquet", "3e2711"), planks: true, maxS: .55 });
}
function wayFromColour(code) {
    const [h, s, l] = toHsl(hex(code.replace(/^#/, ""))), base = WAYS.oxblood;
    return {
        label: code, carpet: specFor("carpet", h, s, l),
        paperA: base.paperA, wood: base.wood, parquet: base.parquet,
        paperB: specFor("paperB", h, Math.min(.34, s * .42 + .03), Math.max(.2, Math.min(.31, l * .55 + .08)))
    };
}
/* a wall's own colours, on top of the floor's */
function wayForWall(base, wall) {
    const one = (group, code) => { if (!code) return base[group]; const [h, s, l] = toHsl(hex(code.replace(/^#/, ""))); return specFor(group, h, s, l); };
    return { ...base, paperA: one("paperA", wall.A), paperB: one("paperB", wall.B), wood: one("wood", wall.wood) };
}
/* The ball post's wood takes the floor's own tone on each floor: its hue and depth of colour, a little lighter since the client drew it darker than the floor */
const POST_LIFT = 1.14, floorTint = name => { const way = wayOf(name) || WAYS.oxblood, spec = way.parquet; return c => { if (c[0] + c[1] + c[2] < 20) return null; const [, s, l] = toHsl(c); return fromHsl([spec[0], Math.min(way.maxS || 1, s * spec[1]), Math.min(1, l * spec[2] * POST_LIFT)]); }; };
const wayOf = name => { if (WAYS[name]) return WAYS[name]; if (typeof name === "string" && name.startsWith("hex:")) return (WAYS[name] = wayFromColour(name.slice(4))); return undefined; };
const colours = n => { const im = piece(n), out = new Set(); for (let i = 0; i < im.rgba.length; i += 4) if (im.rgba[i + 3] > 128) out.add((im.rgba[i] << 16) | (im.rgba[i + 1] << 8) | im.rgba[i + 2]); return out; };
const GROUPS = (() => {
    /* both faces of the wall: the client shades the second face with colours of its own, and any colour left out here
       stays the client's orange on every floor */
    const parquet = colours("floor_plain_tiles"), low = new Set([...colours("wall_lower_left"), ...colours("wall_lower_right")]), wall = new Set([...colours("wall_upper_right_basic"), ...colours("wall_upper_left_basic")]);
    const carpet = new Set([...colours("floor_mat_straight"), ...colours("floor_mat_middle_crossroad")].filter(c => !parquet.has(c)));
    const g = new Map(), hx = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255], num = v => (v[0] << 16) | (v[1] << 8) | v[2];
    for (const c of parquet) if (c) g.set(c, "parquet");
    for (const c of low) if (c) g.set(c, "wood");
    for (const k of ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"]) g.set(num(C[k]), "wood");
    for (const c of wall) { if (!c || g.has(c)) continue; const [h] = toHsl(hx(c)); g.set(c, (h > 55 && h < 240) ? "paperB" : "paperA"); }
    for (const c of carpet) if (c) g.set(c, "carpet");
    for (const h of ["3a0a12", "4c1018", "6e1a14", "510000", "730000", "bc5200", "9d2500"]) g.set(num(hex(h)), "carpet");
    for (const h of ["b2814b", "9e7247"]) g.set(num(hex(h)), "parquet");
    for (const n of ["hw_sofa1_a_0_2_0", "hw_sofa2_a_0_2_0", "hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"]) for (const c of colours(n)) if (c && !g.has(c)) g.set(c, "carpet");
    return g;
})();
function recolour(b, name, box, keep, walls) {
    const W = wayOf(name); if (!W) return;
    const memos = new Map(), memoFor = way => { let q = memos.get(way); if (!q) memos.set(way, q = new Map()); return q; };
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
        const p = (y * b.w + x) * 4, c = (b.d[p] << 16) | (b.d[p + 1] << 8) | b.d[p + 2];
        if (keep && keep[y * b.w + x] === c + 1) continue;      // still the piece that keeps its own colours
        const t = walls ? walls.tag[y * b.w + x] : 0, way = t ? walls.ways[t - 1] : W, memo = memoFor(way);
        let m = memo.get(c);
        if (m === undefined) { const g = GROUPS.get(c), spec = g && way[g]; if (spec) { const [, s, l] = toHsl([b.d[p], b.d[p + 1], b.d[p + 2]]); m = fromHsl([spec[0], Math.min(way.maxS || 1, s * spec[1]), Math.min(.92, l * spec[2])]); } else m = null; memo.set(c, m); }
        if (m) { b.d[p] = m[0]; b.d[p + 1] = m[1]; b.d[p + 2] = m[2]; }
    }
}

/* ---- light: only from sources you can see ---- */
const lampKey = (tx, ty) => Math.abs(Math.round(tx * 2) * 31 + Math.round(ty * 2) * 17);
const LIGHTS = {
    day: { label: "Daylight", off: true, amb: [1.1, 1.08, 1.04], lamp: () => null, tiles: 1, px: 1, p: 0 },
    dusk: { label: "Evening", amb: [.52, .41, .38], lamp: () => [1.05, .78, .46], tiles: 7.5, px: 105, p: .95 },
    dawn: { label: "Dawn", amb: [.5, .46, .56], lamp: i => i % 2 ? null : [1.0, .82, .6], tiles: 6.5, px: 95, p: .7 },
    sconces: { label: "Sconces on", amb: [.56, .53, .52], lamp: () => [1.0, .8, .5], tiles: 7.5, px: 105, p: .85 },
    night: { label: "Night lights", amb: [.17, .18, .25], lamp: i => i % 5 === 3 ? null : [1.15, .82, .46], tiles: 7, px: 100, p: 1.25 },
    failing: { label: "Half the bulbs gone", amb: [.2, .19, .22], lamp: i => i % 2 ? null : [1.15, .9, .55], tiles: 8.5, px: 120, p: 1.25 },
    cold: { label: "Cold fluorescent", amb: [.28, .3, .28], lamp: i => i % 4 === 3 ? null : [.72, .9, .82], tiles: 8, px: 110, p: 1.05 },
    gas: { label: "Gaslight", amb: [.16, .13, .12], lamp: i => i % 3 === 2 ? null : [1.25, .68, .28], tiles: 6.5, px: 92, p: 1.35 }
};

/* ---- the iso sign: letters and plate both sheared column by column ---- */
function wrapPx(name, maxW, f) {
    const lines = []; let cur = "";
    for (const word of String(name).split(" ")) {
        const next = cur ? cur + " " + word : word;
        if (cur && H.textW(next, f) > maxW) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
}
/* the sign crest's colours: a dark-to-bright ramp in the floor's own carpet colour */
function enamel(way) {
    const W = wayOf(way) || WAYS.oxblood, [h, sm, lm] = W.carpet;
    return [[.62, .17], [.56, .27], [.52, .38], [.5, .56]].map(([s, l]) => fromHsl([h, Math.min(1, s * Math.sqrt(sm)), Math.min(.8, l * Math.sqrt(lm))]));
}
function signIso(b, cx, cy, name, o) {
    /* An engraved hotel plaque: mahogany in a double brass frame with cut corners, a screw at each
       end, a little arched crest on top, a shadow on the wall, and letters cut into it. */
    o = o || {};
    const sh = o.alongY ? -1 : 1, f = o.font || "vb", pad = 12, lh = 10;
    const lines = o.lines || (o.w ? wrapPx(name, o.w - pad * 2, f) : H.wrap(name, o.max || 17));
    const widths = lines.map(t => H.textW(t, f));
    const tw = Math.max(...widths), PW = Math.max(tw + pad * 2, 40, o.w || 0), PH = Math.max(lines.length * lh + 9, o.h || 0);
    const extra = (PH - (lines.length * lh + 9)) >> 1;
    const L = -(PW >> 1), CUT = 4;
    const ink = o.hover ? hex("fff4c8") : (o.ink || hex("f6cf80")), cutInk = hex("170703");
    const wood = o.hover ? [hex("5a2410"), hex("4c1c0c")] : [hex("3a1508"), hex("301006")];
    const put = (u, v, c) => b.set(cx + L + u, cy + sh * Math.floor((L + u) / 2) - v, c);
    const ringOf = (u, v) => { const cu = Math.min(u, PW - 1 - u), cv = Math.min(v, PH - 1 - v); return Math.min(cu, cv, cu + cv - CUT); };
    /* the shadow it throws on the wall, one pixel across and two down */
    for (let u = 0; u < PW; u++) for (let v = 0; v < PH; v++) {
        if (ringOf(u, v) < 0) continue;
        const X = cx + L + u + 1, Y = cy + sh * Math.floor((L + u) / 2) - v + 2;
        if (X >= 0 && Y >= 0 && X < b.w && Y < b.h) { const k = b.get(X, Y); b.set(X, Y, [k[0] * .55, k[1] * .55, k[2] * .55]); }
    }
    /* the crest: a small stepped cap, straight-edged so it sits true on the slant, enamelled in the
       colour of this floor's carpet with a brass stud. Black all round; lit from the left and above. */
    const cm = PW >> 1, E = enamel(o.way);
    const block = (u0, u1, v0, v1) => {
        for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
            const edge = u === u0 || u === u1 || v === v1;
            put(u, v, edge ? C.k : v === v1 - 1 ? E[3] : u === u0 + 1 ? E[2] : u === u1 - 1 ? E[0] : E[1]);
        }
    };
    block(cm - 9, cm + 9, PH - 1, PH + 3);                                                        // the lower step
    block(cm - 5, cm + 5, PH + 2, PH + 6);                                                        // the upper step
    /* the stud */
    put(cm - 1, PH + 1, C.b1); put(cm + 1, PH + 1, C.b1); put(cm, PH + 2, C.b1); put(cm, PH, C.b1);
    put(cm, PH + 1, hex("ffe7a8"));
    /* the plaque */
    for (let u = 0; u < PW; u++) for (let v = 0; v < PH; v++) {
        const r = ringOf(u, v);
        if (r < 0) continue;
        let c;
        if (r === 0) c = C.k;
        else if (r === 1) { const lit = (v > PH / 2) || u < 3; c = lit ? hex("ffe7a8") : C.b1; }
        else if (r === 2) c = C.b2;
        else if (r === 3) c = C.k;
        else c = wood[(u + (v >> 1)) % 9 === 0 ? 1 : 0];
        put(u, v, c);
    }
    /* a thin engraved line just inside */
    for (let u = 6; u < PW - 6; u++) { put(u, 5, wood[1]); put(u, PH - 6, hex("5e2c14")); }
    /* a screw at each end */
    for (const su of [7, PW - 8]) {
        const sv = PH >> 1;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { if (i * i + j * j > 5) continue; put(su + i, sv + j, i * i + j * j > 3 ? C.k : (i + j < 0 ? C.b4 : C.b2)); }
        put(su - 1, sv + 1, C.b1); put(su + 1, sv - 1, C.b1); put(su, sv, C.b1);
    }
    /* letters, with the dark of the cut under each */
    lines.forEach((ln, li) => {
        let U = -(widths[li] >> 1);
        const topV = PH - 7 - li * lh - extra;
        for (const ch of ln) {
            const g = H.VOL[f][ch] || H.VOL[f][" "];
            g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") { const col = U + i - 1, Y = cy + sh * Math.floor(col / 2) - topV + (j - 3); b.set(cx + col, Y + 1, cutInk); } });
            g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") { const col = U + i - 1, Y = cy + sh * Math.floor(col / 2) - topV + (j - 3); b.set(cx + col, Y, ink); } });
            U += g.w;
        }
    });
}

/* ---- the sign at the foot of a staircase ----
   A mahogany plaque in a brass frame, hanging on two chains from an iron arm, standing straight out from the wall: "Floor 1"
   and an arrow pointing diagonally up towards the stairs. Its face runs along the map's y, so it climbs to the right. (ax, ay) is
   the point on the wall at floor level. The size is worked out so the text and arrow always have a clear margin inside the frame;
   editor.js does the same sums to know where it is. */
const PLAQUE = { h: 66, off: 3, H: 30, frame: 2, pad: 4, textFloor: 6, arrowFloor: 16, wordGap: 4 };
const ARROW = ["...111111", "....11111", ".....1111", "....11111", "...111.11", "..111...1", ".111.....", "111......", "11......."];
function plaqueWidth(name) {
    const words = String(name).split(" "), tw = words.reduce((a, t) => a + H.textW(t, "vb"), 0) + (words.length - 1) * PLAQUE.wordGap;
    return Math.max(50, tw + 2 * (PLAQUE.frame + PLAQUE.pad));
}
function stairPlaque(b, ax, ay, name, o) {
    o = o || {};
    const BR = ["7a4a14", "b47a22", "ddaa63", "f2be70", "ffe7a8"].map(hex), WD = ["240a02", "3a1508", "4c1c0c", "5a2410", "7a3a1a", "925030"].map(hex), IRON = ["121016", "26222c", "3c3744", "5a5462"].map(hex);
    const { h, off, H: Hd, textFloor, arrowFloor, wordGap } = PLAQUE, Wd = plaqueWidth(name), L = ax - off - Wd, B = ay - h + Math.floor((Wd + off) / 2);
    const at = (s, t) => [L + s, B - Math.floor(s / 2) - t], put = (s, t, c) => { const q = at(s, t); b.set(q[0], q[1], c); };
    /* a shape, then a black line round the outside of it */
    const outlined = draw => {
        const seen = new Map(), mark = (x, y, c) => { if (x >= 0 && y >= 0 && x < b.w && y < b.h) seen.set(y * b.w + x, c); };
        draw(mark);
        for (const i of seen.keys()) { const x = i % b.w, y = (i / b.w) | 0; for (const [p, q] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((y + q) * b.w + x + p)) b.set(x + p, y + q, C.k); }
        for (const [i, c] of seen) b.set(i % b.w, (i / b.w) | 0, c);
    };
    /* the arm, level with the wall's slope going out, a little scroll under it, and a brass plate on the wall */
    const armH = h + Hd + 8, len = Wd + off + 2;
    outlined(mark => {
        for (let t = -6; t <= 6; t++) for (const u of [-1, 0, 1]) mark(ax + u, ay - armH - t + Math.floor(u / 2), u < 0 ? BR[3] : u ? BR[1] : BR[2]);
        for (let u = 0; u <= len; u++) { const y = ay - armH + Math.floor(u / 2); mark(ax - u, y, IRON[2]); mark(ax - u, y - 1, IRON[3]); }
        for (let a = 0; a < 44; a++) { const th = a / 44 * Math.PI * 1.5, r = 6 * (1 - a / 66); mark(Math.round(ax - 9 + Math.cos(th) * r), Math.round(ay - armH + 9 - Math.sin(th) * r), IRON[2]); }
        const e = [ax - len, ay - armH + Math.floor(len / 2) - 1]; for (const [p, q] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) mark(e[0] + p, e[1] + q, BR[3]);
    });
    /* two chains */
    for (const sc of [6, Wd - 7]) { const top = at(sc, Hd), armY = ay - armH + Math.floor((ax - top[0]) / 2) + 1; for (let y = armY; y < top[1]; y++) b.set(top[0], y, (y - armY) % 3 === 2 ? BR[0] : BR[2]); }
    /* the plaque, with its top edge and outer end showing */
    outlined(mark => {
        const set = (s, t, c) => { const q = at(s, t); mark(q[0], q[1], c); };
        for (let d = 1; d <= 2; d++) {
            for (let s = 0; s < Wd; s++) { const q = at(s, Hd - 1); mark(q[0] - d, q[1] - Math.ceil(d / 2), WD[5]); }
            for (let t = 0; t < Hd; t++) { const q = at(0, t); mark(q[0] - d, q[1] - Math.ceil(d / 2), WD[1]); }
        }
        for (let s = 0; s < Wd; s++) for (let t = 0; t < Hd; t++) { const r = Math.min(s, Wd - 1 - s, t, Hd - 1 - t); set(s, t, r === 0 ? BR[t > Hd / 2 ? 3 : 1] : r === 1 ? BR[0] : WD[(s + (t >> 1)) % 9 ? 1 : 2]); }
    });
    const ink = hex("f6cf80"), cut = hex("170703");
    /* the arrow, centred, pointing the way the stairs climb */
    const a0 = (Wd - 9) >> 1;
    for (const [dt, c] of [[-1, cut], [0, ink]]) ARROW.forEach((row, j) => { for (let i = 0; i < 9; i++) if (row[i] === "1") put(a0 + i, arrowFloor + 8 - j + dt, c); });
    /* the words, on their baseline: each letter's picture has blank rows above, and its foot at row 10 */
    const words = String(name).split(" "), tw = words.reduce((a, t) => a + H.textW(t, "vb"), 0) + (words.length - 1) * wordGap;
    let U = (Wd - tw) >> 1;
    for (const word of words) {
        for (const ch of word) {
            const g = H.VOL.vb[ch] || H.VOL.vb[" "];
            for (const [dt, c] of [[-1, cut], [0, ink]]) g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "1") put(U + i, textFloor + 10 - j + dt, c); });
            U += g.w;
        }
        U += wordGap;
    }
}

/* ---- half-size stairs ---- */
const TR = { run: [hex("510000"), hex("730000")], trim: [hex("bc5200"), hex("9d2500")] };
function treadCol(u, v, wpx) {
    /* u across the flight. Carpet stops one tile short of each side; polished wood outside it. */
    const r = Math.min(u - 16, wpx - 17 - u);
    if (r < 0) return (u === 0 || u === wpx - 1) ? C.k : (u % 3 === 0 ? C.d3 : C.d4);
    if (r < RUG.ramp.length) return RUG.ramp[r];
    return (u % 2) ? TR.run[0] : TR.run[1];
}
/* A flight of stairs, worked out backwards from each pixel: follow the line of sight and take the first
   surface it meets, so treads, risers and the side can't leave gaps or overlap each other. c runs across
   the flight, d along it; it climbs toward -d, a tread half a tile deep and a riser 8px. The carpet goes
   over both tread and riser as one length, so its stripes and border run unbroken up the stairs. */
function carpetTone(c, way) {
    const W = wayOf(way); if (!W) return c;
    const [, s, l] = toHsl(c), spec = W.carpet;
    return fromHsl([spec[0], Math.min(1, s * spec[1]), Math.min(1, l * spec[2])]);
}
/* A sofa keeps its wood on every floor, and only its cushions take the floor's carpet colour */
const CUSHION = new Set(["9d2400", "7e250a", "d34013", "730000", "330000"].map(h => { const c = hex(h); return (c[0] << 16) | (c[1] << 8) | c[2]; }));
/* The frame shares colours with the cushion, so colour alone can't tell them apart: the cushion is whatever joins up with the seat's own red, inside its black line. */
const cushionMasks = new Map();
function cushionMask(part) {
    let m = cushionMasks.get(part); if (m) return m;
    const im = piece(part), at = (x, y) => { const q = (y * im.w + x) * 4; return im.rgba[q + 3] < 128 ? -1 : (im.rgba[q] << 16) | (im.rgba[q + 1] << 8) | im.rgba[q + 2]; };
    m = new Uint8Array(im.w * im.h); const todo = [];
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (at(x, y) === 0x9d2400) { m[y * im.w + x] = 1; todo.push([x, y]); }
    while (todo.length) { const [x, y] = todo.pop(); for (const [X, Y] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (X < 0 || Y < 0 || X >= im.w || Y >= im.h || m[Y * im.w + X] || !CUSHION.has(at(X, Y))) continue; m[Y * im.w + X] = 1; todo.push([X, Y]); } }
    cushionMasks.set(part, m); return m;
}
function cushionTint(way) { return (c, part, i, j) => cushionMask(part)[j * piece(part).w + i] ? carpetTone(c, way).map(v => Math.round(v)) : null; }
/* the floor's own colours, darkest to lightest: steps within a floor are made of them, and so take the floor's colour with it */
const PARQUET = [...colours("floor_plain_tiles")].filter(c => c).map(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255]).sort((a, c) => (a[0] + a[1] + a[2]) - (c[0] + c[1] + c[2]));
const pq = t => PARQUET[Math.max(0, Math.min(PARQUET.length - 1, Math.round(t * (PARQUET.length - 1))))], pqAll = pq;
/* a point on the floor's own tile pattern */
const parquetAt = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y; return modPx(plain, false, 2 + m4(X), 2 + m4(Y), Math.round((fx - fy) * 16), Math.floor((fx + fy) * 8)) || pq(.6); };
/* A floor of thick planks, one tile wide, running along x with staggered ends: worked out per pixel from where it falls on the floor, so it runs on unbroken from tile to tile.
   Drawn in the floor's own colours, so the colourway tones them like any floor. */
const PLANK_TONES = PARQUET.filter(c => GROUPS.get((c[0] << 16) | (c[1] << 8) | c[2]) === "parquet"), plq = t => PLANK_TONES[Math.max(0, Math.min(PLANK_TONES.length - 1, Math.round(t * (PLANK_TONES.length - 1))))];
const stepTones = way => (wayOf(way) || {}).planks ? t => plq(t * .62) : pqAll;      // the planks sit low in the floor's range, so a step's lit edge has to as well or it glows
const plankHash = (a, b, c) => { let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const plankAt = (X, Y, dx, dy) => plankAtUnits(X * 32 + 2 * dy + dx, Y * 32 + 2 * dy - dx);
const plankXY = (x, y) => plankAtUnits(Math.floor(x * 32), Math.floor(y * 32));
/* Laid like a brick wall: rows half a tile wide, every plank the same length, and each row's joints exactly halfway along the planks of the rows beside it.
   One thin dark line between planks and nothing else: the body tones stay well clear of the line's, so no grain or shading can sit against it and thicken it. */
const plankAtUnits = (xu, yu) => {
    const W = 16, L = 32 * 3, row = Math.floor(yu / W), ry = ((yu % W) + W) % W;
    const xp = xu + (((row % 2) + 2) % 2 ? L / 2 : 0), n = Math.floor(xp / L), rx = ((xp % L) + L) % L;
    if (ry < 2 || rx < 2) return PLANK_TONES[0];
    const last = PLANK_TONES.length - 1, lo = Math.min(2, last), body = lo + plankHash(row, n, 2) % Math.max(1, Math.min(3, last - lo));
    const g = plankHash(row * 8 + (ry >> 2), n, Math.floor((xp + plankHash(row, ry >> 2, 3) % 40) / 40)) % 9;
    return PLANK_TONES[Math.min(last, g === 0 ? body + 1 : body)];
};
/* A storey is 163px and 20 steps of 8 make 160: the top step takes the difference, so a flight meets the floor above */
const STAIR_TOP = 3;
/* The client's own short flights: each step 4px tall and 6px deep. */
const STEP_R = 4, STEP_D = 6 / 16;
/* Steps climbing towards you: the higher floor is nearer than the lower one, so each step's front faces away and only the tops show,
   nearly on top of each other. Drawn from the far step forward; the near side shows the stepped end. */
function flightUpToYou(w, o) {
    const { axis, c0, c1, dStart, steps, zB, carpet, way } = o, alongY = axis === "y", pq = stepTones(way), grainAt = (wayOf(way) || {}).planks ? plankXY : parquetAt;
    const scr = (c, d, z) => alongY ? [Math.round((c - d) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z] : [Math.round((d - c) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z];
    const [ca, cb] = carpet || [1e9, 1e9], put = (q, c) => w.b.set(q[0], q[1], c), toned = new Map();
    const rugAt = (cc, path) => { const r = Math.min(Math.floor((cc - ca) * 16), Math.floor((cb - cc) * 16 - 1e-6)), base = r < RUG.ramp.length ? RUG.ramp[r] : RUG.at(68 + (path % 32), RUG.core + (((Math.floor(cc * 16) % 16) + 16) % 16)), key = (base[0] << 16) | (base[1] << 8) | base[2]; if (!toned.has(key)) toned.set(key, carpetTone(base, way).map(v => Math.round(v))); return toned.get(key); };
    /* Going away from you, each step moves exactly 6 columns along and 1 row, so the steps can be laid as exact pixel strips along the same 2:1 line the floor's edges use.
       Sampling them pixel by pixel lost the lines between steps and made the edges jagged. Each step shows 2 rows past the nearer one: a shaded row along its far edge, then a lit one, then the floor's own grain where more of it shows,
       which is what makes it read as steps. The top one, next to the higher floor, shows all 6. Black only along the far edge of the lowest. */
    const wide = Math.round((c1 - c0) * 16), dim = (c, k) => [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0];
    /* the end you can see first, so the steps lie over its top */
    const pts = [[c1, dStart, 0], [c1, dStart + steps * STEP_D, steps * STEP_R], [c1, dStart + steps * STEP_D, 0]].map(q => scr(q[0], q[1], q[2]));
    const X0 = Math.max(0, Math.min(...pts.map(q => q[0])) - 2), X1 = Math.min(w.b.w - 1, Math.max(...pts.map(q => q[0])) + 2), Y0 = Math.max(0, Math.min(...pts.map(q => q[1])) - 2), Y1 = Math.min(w.b.h - 1, Math.max(...pts.map(q => q[1])) + 2);
    for (let sy = Y0; sy <= Y1; sy++) for (let sx = X0; sx <= X1; sx++) {
        const A = (sx + .5 - w.ox) / 16, B = (sy + .5 - w.oy + zB) / 8, x0 = (A + B) / 2, y0 = (B - A) / 2, c = alongY ? x0 : y0, d = alongY ? y0 : x0, tz = c1 - c, zz = tz * 16, dd = d + tz, k = Math.floor((dd - dStart) / STEP_D);
        if (zz >= 0 && k >= 0 && k < steps && zz <= (k + 1) * STEP_R) w.b.set(sx, sy, pq(.42));
    }
    for (let k = 0; k < steps; k++) {
        const d0 = dStart + k * STEP_D, z = (k + 1) * STEP_R, rows = k === steps - 1 ? 6 : 2;
        /* One row down the screen, in one column, is 1/16 further across AND 1/16 further along, so the pattern has to move both ways or it shears. */
        for (let u = -rows - 1; u < wide; u++) {
            const p = scr(c0 + u / 16, d0, z);
            for (let r = 0; r <= rows; r++) {
                if (r === rows && k < steps - 1) break;
                const cc = c0 + (u + r + .5) / 16, dd = d0 + (r + .5) / 16; if (cc < c0 || cc >= c1) continue;
                const uu = Math.floor((cc - c0) * 16), end = uu === 0 || uu === wide - 1, far = r === 0, onRug = cc >= ca && cc < cb, rc = onRug && rugAt(cc, k * 6 + r);
                const col = far && k === 0 && !onRug ? C.k : onRug ? (far ? dim(rc, .6) : rc) : far || end ? pq(.3) : r === 1 ? pq(1) : grainAt(alongY ? cc : dd, alongY ? dd : cc);
                w.b.set(p[0], p[1] + r, col);
            }
        }
    }
}
/* One pixel of the ordinary wall standing on a line. faceY: the wall runs along y at x = line, as a flight's side does when it climbs along y. high: how far up the wall this pixel is, so the top of the wallpaper's repeat can stand in for the cap. */
function stairWallPx(w, faceY, line, sx, sy, high, zFloor) {
    const im = faceY ? SEAMY : SEAMX, W = 138, T = w.wallTop, CAP = 26, REPEAT = 18;
    let i, p1;
    if (faceY) { const at = line * 16 + w.ox - sx, ym = Math.floor((at - 1) / 128) * 8; i = W - (at - ym * 16); p1 = Math.round((line + ym) * 8) + w.oy - zFloor; }
    else { const at = sx - w.ox + line * 16, xm = Math.floor(at / 128) * 8; i = at - xm * 16; p1 = Math.round((xm + line) * 8) + w.oy - zFloor; }
    let j = sy - p1 + T; if (high > Z1 - CAP) j += REPEAT * Math.ceil((high - (Z1 - CAP)) / REPEAT);
    if (i < 0 || i >= im.w || j < 0 || j >= im.h) return null;
    const s = (j * im.w + i) * 4; return im.rgba[s + 3] < 128 ? null : [im.rgba[s], im.rgba[s + 1], im.rgba[s + 2]];
}
function flight(w, o) {
    const { axis, c0, c1, dTop, steps, zB, carpet, way } = o, alongY = axis === "y", pq = stepTones(way), planks = !!(wayOf(way) || {}).planks, grainAt = planks ? plankXY : parquetAt, tiled = !!o.tiled, woody = tiled || planks, R = o.rise || 8, D = o.tread || .5, dBot = dTop + steps * D, topOf = k => (k + 1) * R + (k === steps - 1 ? o.topExtra || 0 : 0), topZ = topOf(steps - 1);
    const scr = (c, d, z) => alongY ? [Math.round((c - d) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z] : [Math.round((d - c) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z];
    const pts = [[c0, dBot, 0], [c1, dBot, 0], [c0, dTop, topZ], [c1, dTop, topZ], [c1, dTop, 0], [c0, dTop, 0]].map(q => scr(q[0], q[1], q[2]));
    const X0 = Math.max(0, Math.min(...pts.map(q => q[0])) - 2), X1 = Math.min(w.b.w - 1, Math.max(...pts.map(q => q[0])) + 2);
    const Y0 = Math.max(0, Math.min(...pts.map(q => q[1])) - 2), Y1 = Math.min(w.b.h - 1, Math.max(...pts.map(q => q[1])) + 2);
    const [ca, cb] = carpet || [1e9, 1e9], tones = new Map();
    const tone = (c, k) => { const key = (c[0] << 16 | c[1] << 8 | c[2]) + "|" + k; let v = tones.get(key); if (!v) { const t = carpetTone(c, way); v = [Math.min(255, t[0] * k) | 0, Math.min(255, t[1] * k) | 0, Math.min(255, t[2] * k) | 0]; tones.set(key, v); } return v; };
    const wide = Math.round((c1 - c0) * 16);
    const skin = (cc, path, wood, k) => {
        const u = Math.floor((cc - c0) * 16);
        if (u < 1 || u >= wide - 1) return C.k;
        if (cc >= ca && cc < cb) {
            const r = Math.min(Math.floor((cc - ca) * 16), Math.floor((cb - cc) * 16 - 1e-6));
            const base = r < RUG.ramp.length ? RUG.ramp[r] : RUG.at(68 + (path % 32), RUG.core + (((Math.floor(cc * 16) % 16) + 16) % 16));
            return tone(base, k);
        }
        return wood(u);
    };
    for (let sy = Y0; sy <= Y1; sy++) for (let sx = X0; sx <= X1; sx++) {
        const A = (sx + .5 - w.ox) / 16, B = (sy + .5 - w.oy + zB) / 8, x0 = (A + B) / 2, y0 = (B - A) / 2, c = alongY ? x0 : y0, d = alongY ? y0 : x0;
        let best = -1e9, col = null;
        for (let k = 0; k < steps; k++) {
            const front = dBot - k * D, back = front - D;
            /* the tread */
            const tt = topOf(k) / 16;
            if (tt > best) {
                const cc = c + tt, dd = d + tt;
                if (cc >= c0 && cc < c1 && dd < front && dd >= back) {
                    const depth = (front - dd) * 16, deep = D * 16 - 1, shade = depth < 1 ? 1.5 : depth >= deep ? .55 : 1.12;
                    best = tt;
                    col = skin(cc, k * 16 + 8 + Math.floor(depth), woody ? () => depth < 1 ? pq(1) : depth >= deep ? pq(.35) : grainAt(alongY ? cc : dd, alongY ? dd : cc) : u => depth < 1 ? C.d6 : depth >= deep ? C.d1 : (((u >> 2) + k) % 3 ? C.d4 : C.d3), shade);
                }
            }
            /* the riser */
            const tr = front - d, zz = tr * 16;
            if (tr > best && zz >= k * R && zz < topOf(k)) {
                const cc = c + tr;
                if (cc >= c0 && cc < c1) {
                    const h = zz - k * R, tall = topOf(k) - k * R, shade = h >= tall - 1 ? .42 : h < 1 ? .5 : .66;
                    best = tr;
                    col = skin(cc, k * 16 + Math.floor(h), woody ? u => h >= tall - 1 ? pq(0) : h < 1 ? pq(.15) : (u >> 1) % 3 ? pq(.42) : pq(.3) : () => h >= tall - 1 ? C.d0 : h < 1 ? C.d1 : C.d2, shade);
                }
            }
        }
        /* the side facing you */
        const ts = c1 - c, ds = d + ts, zs = ts * 16;
        if (o.near !== false && ts > best && ds >= dTop && ds < dBot && zs >= 0) {
            const k = Math.floor((dBot - ds) / D), top = topOf(k);
            if (zs < top) { const gap = top - zs, wallAt = !tiled && (gap < 1 ? C.k : stairWallPx(w, alongY, c1, sx, sy, zs + zB - (o.wallFloor === undefined ? zB : o.wallFloor), o.wallFloor === undefined ? zB : o.wallFloor)); best = ts; col = wallAt || (woody ? (gap < 1 ? pq(1) : gap < 2 ? pq(0) : zs < 1 ? C.k : (Math.floor(ds * 16) >> 1) % 3 ? pq(.55) : pq(.4)) : (gap < 1 ? C.d6 : gap < 2 ? C.k : zs < 1 ? C.k : ((Math.floor(ds * 16) >> 1) % 6 === 0 ? C.d2 : C.d3))); }
        }
        if (col) w.b.set(sx, sy, col);
    }
}
/* A flight's banisters, one each side: a proper moulded rail of five rows on a spindle per step, with a post at each end.
   They're drawn after the walls round them, or those paint over most of them, and put(x, y, colour, c, d, z) says which pixels of them can be seen from here, at what height in the room. */
/* With floor beyond its open side at its foot, that side's up against a wall that stands in front of it, so it has no rail to see */
const railsFor = (f, patches) => { const dBot = f.dTop + f.steps * .5 - .5, X = f.axis === "y" ? f.c1 : dBot, Y = f.axis === "y" ? dBot : f.c1, inFloor = (A, B) => patches.some(q => !q.notch && A >= q.x0 && A < q.x1 && B >= q.y0 && B < q.y1), walled = !inFloor(X, Y) && (f.axis === "y" ? inFloor(X, Y + 1) : inFloor(X + 1, Y)); return walled ? { ...f, near: false } : f; };
function flightRails(w, o, paint) {
    const { axis, c0, c1, steps, zB } = o, alongY = axis === "y", D = .5, dTop = o.dTop, dBot = dTop + steps * D;
    const put = (x, y, col, c, d, z) => paint(x, y, col, alongY ? c : d, alongY ? d : c, z);
    const at = (c, d, z) => alongY ? [Math.round((c - d) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z] : [Math.round((d - c) * 16) + w.ox, Math.round((c + d) * 8) + w.oy - zB - z];
    const RAIL = 22, len = steps * 8, PROFILE = [C.k, C.d7, C.d6, C.d5, C.d3, C.k];
    const dot = (c, d, z, up, col) => { const q = at(c, d, z); put(q[0], q[1] - up, col, c, d, zB + z + up); };
    const rail = (c, near) => {
        for (let i = 8; i < len; i += 8) { const d = dBot - i / 16, z = i - 8 + 8; /* a spindle on each step */ for (let h = 1; h < RAIL - 2; h++) { const q = at(c, d, z + h); put(q[0], q[1], C.k, c, d, zB + z + h); put(q[0] + 1, q[1], h % 6 === 3 ? C.d6 : C.d5, c, d, zB + z + h); put(q[0] + 2, q[1], C.k, c, d, zB + z + h); } }
        const rowOf = i => at(c, dBot - i / 16, i + RAIL)[1];
        for (let i = 0; i <= len; i++) {
            const d = dBot - i / 16, z = i + RAIL; PROFILE.forEach((col, r) => dot(c, d, z, 3 - r, col));
            /* where the next column jumps two rows, carry the outline across the gap */
            const q = at(c, d, z), rise = i < len ? q[1] - rowOf(i + 1) : 0, sag = i > 0 ? rowOf(i - 1) - q[1] : 0;
            for (let g = 1; g < rise; g++) put(q[0], q[1] - 3 - g, C.k, c, d, zB + z + 3 + g);
            for (let g = 1; g < sag; g++) put(q[0], q[1] + 2 + g, C.k, c, d, zB + z - 2 - g);
        }
        /* the post at each end */
        const post = (d, z, tall) => { for (let h = 0; h < tall; h++) for (let k = -2; k <= 2; k++) { const q = at(c, d, z + h); put(q[0] + k, q[1], Math.abs(k) === 2 ? C.k : k < 0 ? C.d6 : k === 0 ? C.d4 : C.d2, c, d, zB + z + h); } for (let k = -2; k <= 2; k++) for (let h = 0; h < 3; h++) { const q = at(c, d, z + tall + h); put(q[0] + k, q[1], h === 2 || Math.abs(k) === 2 ? C.k : k < 1 ? C.b4 : C.b2, c, d, zB + z + tall + h); } };
        post(dBot, 0, RAIL + 3);
        post(dTop, len, RAIL + 3);
        /* flat along the landing's back wall, on spindles like the rest */
        if (!near && o.run) { const n = o.run * 16; for (let j = 1; j <= n; j++) { const d = dBot + j / 16, z = RAIL; PROFILE.forEach((col, r) => dot(c, d, z, 3 - r, col)); if (j % 8 === 0 && j < n) for (let h = 1; h < RAIL - 2; h++) { const q = at(c, d, h); put(q[0], q[1], C.k, c, d, zB + h); put(q[0] + 1, q[1], h % 6 === 3 ? C.d6 : C.d5, c, d, zB + h); put(q[0] + 2, q[1], C.k, c, d, zB + h); } } post(dBot + o.run, 0, RAIL + 3); }
        if (near && o.landRun) { const n = o.landRun * 16; for (let j = 1; j <= n; j++) { const d = dTop - j / 16, z = len + RAIL; PROFILE.forEach((col, r) => dot(c, d, z, 3 - r, col)); if (j % 8 === 0 && j < n) for (let h = 1; h < RAIL - 2; h++) { const q = at(c, d, len + h); put(q[0], q[1], C.k, c, d, zB + len + h); put(q[0] + 1, q[1], h % 6 === 3 ? C.d6 : C.d5, c, d, zB + len + h); put(q[0] + 2, q[1], C.k, c, d, zB + len + h); } } post(dTop - o.landRun, len, RAIL + 3); }
    };
    if (o.far !== false) rail(c0 + .3, false);
    if (o.near !== false) rail(c1 - .3, true);
}
function flightY(w, a, b, yTop, steps, zB) {
    /* climbs toward -y; step 0 is the top. Half a tile deep, 8px rise. */
    const wpx = (b - a) * 16;
    for (let i = 0; i < steps; i++) {
        const y = yTop + i * .5, z = zB + (steps - i) * 8;
        const o = [Math.round((a - y) * 16) + w.ox, Math.round((a + y) * 8) + w.oy - z];
        for (let v = 0; v < 8; v++) for (let u = 0; u < wpx; u++) {
            const sx = o[0] + u - v, sy = o[1] + Math.floor(u / 2) + Math.floor(v / 2);
            let c = treadCol(u, v, wpx);
            if (v >= 7) c = u < 16 || u >= wpx - 16 ? C.d6 : C.b4;
            w.b.set(sx, sy, c); w.b.set(sx - 1, sy, c);
        }
        for (let u = 0; u <= wpx; u++) for (let h = 1; h <= 8; h++) {
            const sx = o[0] + u - 8, sy = o[1] + Math.floor(u / 2) + 4 + h;
            let c = (u >= 16 && u < wpx - 16) ? ((u % 2) ? hex("3a0000") : TR.run[0]) : C.d2;
            if (h === 8) c = C.k; else if (h === 1) c = C.d1;
            w.b.set(sx, sy, c);
        }
    }
    /* the side you can see */
    const yBot = yTop + steps * .5, base = [Math.round((b - yBot) * 16) + w.ox, Math.round((b + yBot) * 8) + w.oy - zB];
    for (let v = 0; v <= steps * 8; v++) {
        const top = (Math.floor(v / 8) + 1) * 8 - 2;
        for (let h = -1; h <= top; h++) {
            const sx = base[0] + v, sy = base[1] - Math.floor(v / 2) - h;
            let c = (v >> 1) % 6 === 0 ? C.d2 : C.d3;
            if (h === top) c = C.d6; else if (h === top - 1) c = C.k; else if (h <= 0) c = C.k;
            w.b.set(sx, sy, c);
        }
    }
    /* handrails with a post on every other step */
    for (const side of [a, b]) {
        const s0 = [Math.round((side - yBot) * 16) + w.ox, Math.round((side + yBot) * 8) + w.oy - zB];
        for (let v = 0; v <= steps * 8; v++) {
            const sx = s0[0] + v, sy = s0[1] - Math.floor(v / 2) - v - 15;
            w.b.set(sx, sy - 1, C.k); w.b.set(sx, sy, C.b4); w.b.set(sx, sy + 1, C.b2); w.b.set(sx, sy + 2, C.k);
            if (v % 16 === 4) for (let h = 3; h < 15; h++) w.b.set(sx, sy + h, C.b1);
        }
        for (let h = 0; h < 20; h++) { w.b.set(s0[0] - 1, s0[1] - h, C.k); w.b.set(s0[0], s0[1] - h, C.d6); w.b.set(s0[0] + 1, s0[1] - h, C.d3); w.b.set(s0[0] + 2, s0[1] - h, C.k); }
        for (let a2 = -1; a2 <= 2; a2++) for (let j = 20; j < 23; j++) w.b.set(s0[0] + a2, s0[1] - j, C.b4);
    }
}
function flightX(w, y0, y1, xTop, steps, zB, o) {
    /* climbs toward -x; step 0 is the top */
    o = o || {};
    const wpx = (y1 - y0) * 16;
    for (let i = 0; i < steps; i++) {
        const x = xTop + i * .5, z = zB + (steps - i) * 8;
        const a = [Math.round((x - y1) * 16) + w.ox, Math.round((x + y1) * 8) + w.oy - z];
        for (let v = 0; v < 8; v++) for (let u = 0; u < wpx; u++) {
            const sx = a[0] + u + v, sy = a[1] - Math.floor(u / 2) + Math.floor(v / 2);
            let c = treadCol(u, v, wpx);
            if (o.band) { const yy = y1 - u / 16, rel = Math.min(yy - o.band[0], o.band[1] - yy); c = rel < 0 ? ((sx >> 1) % 3 ? hex("b2814b") : hex("9e7247")) : rel < 1 ? ((u % 2) ? TR.trim[0] : TR.trim[1]) : ((u % 2) ? TR.run[0] : TR.run[1]); }
            if (v >= 7) c = (o.band ? (y1 - u / 16 < o.band[0] || y1 - u / 16 >= o.band[1]) : (u < 3 || u >= wpx - 3)) ? C.d6 : C.b4;
            w.b.set(sx, sy, c); w.b.set(sx + 1, sy, c);
        }
        for (let u = 0; u <= wpx; u++) for (let h = 1; h <= 8; h++) {
            const sx = a[0] + u + 8, sy = a[1] - Math.floor(u / 2) + 4 + h;
            const yy = y1 - u / 16, inR = (u >= 16 && u < wpx - 16);
            let c = inR ? ((u % 2) ? hex("510000") : hex("3a0000")) : C.d3;
            if (h === 8) c = C.k; else if (h === 1) c = C.d0;
            w.b.set(sx, sy, c);
        }
    }
    if (o.side !== false) {
        /* the side facing you, along the near edge of the flight */
        const xBot = xTop + steps * .5, base = [Math.round((xBot - y1) * 16) + w.ox, Math.round((xBot + y1) * 8) + w.oy - zB];
        for (let v = 0; v <= steps * 8; v++) {
            const top = (Math.floor(v / 8) + 1) * 8 - 2;
            for (let h = -1; h <= top; h++) {
                const sx = base[0] - v, sy = base[1] - Math.floor(v / 2) - h;
                let c = (v >> 1) % 6 === 0 ? C.d3 : C.d4;
                if (h === top) c = C.d7; else if (h === top - 1) c = C.k; else if (h <= 0) c = C.k;
                w.b.set(sx, sy, c);
            }
        }
    }
}

/* ---- a standing lamp: new art, and a real light source ---- */
/* Floor lamps: the art is in floor-lamps.js. A lamp keeps its own colours on every floor, its glowing parts stay out of
   the room's lighting so a lit shade never bleaches, and it leaves a soft shadow at its foot. */
const LAMP_STYLES = FloorLamps.STYLES;
function floorLamp(w, tx, ty, style, colour) {
    const kind = LAMP_STYLES[style] ? style : "hotel", p = w.S(tx + .5, ty + .5);
    w.sprites.push({ depth: tx + ty + .4, draw: () => {
        const bd = w.b, cx = p[0], cy = p[1], art = FloorLamps.pixels(kind, !!w.lightsOff, colour);
        if (w.footShadows) w.footShadows.push([cx, cy, w.z]);
        for (const [dx, dy, c, g] of art.list) {
            const X = cx + dx, Y = cy + dy;
            bd.set(X, Y, c);
            if (X < 0 || Y < 0 || X >= bd.w || Y >= bd.h) continue;
            const i = Y * bd.w + X, v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1;
            if (w.keep) w.keep[i] = v;
            if (w.glowing) w.glowing[i] = g ? v : 0;
        }
    }});
    w.lamps.push({ free: true, tx: tx + .5, ty: ty + .5, lz: w.z, x: p[0], y: p[1] - FloorLamps.pixels(kind, false).lightH, colour });
}

/* ---- the entrance ----
   The client's own: an alcove piece the size of an 8-tile stretch of wall, and the arch that stands in front of whoever walks through it, with its
   EXIT sign. Both are stretched to these taller walls below the sign, so the arch is taller and the sign stays by the cap. */
function framed(alcove, arch, dx, dy, flip) {
    const o = { w: alcove.w, h: alcove.h, rgba: Buffer.alloc(alcove.w * alcove.h * 4) };
    for (let j = 0; j < arch.h; j++) for (let i = 0; i < arch.w; i++) { const q = (j * arch.w + i) * 4; if (arch.rgba[q + 3] < 128) continue; const X = flip ? alcove.w - 1 - (dx + i) : dx + i, Y = dy + j; if (X < 0 || Y < 0 || X >= o.w || Y >= o.h) continue; arch.rgba.copy(o.rgba, (Y * o.w + X) * 4, q, q + 4); }
    return o;
}
const portalMemo = new Map();
/* phase: how many tiles along the wall's 8-tile repeat the entrance stands, so the wallpaper beside the arch still runs true */
const portalArt = (phase = 0) => portalMemo.get(phase) || (portalMemo.set(phase, (() => {
    const REG_HALL = require("../art/regs.json").hall, reg = n => REG_HALL[n] || [0, 0], eY = piece("entry_upper_right"), eX = piece("entry_upper_left"), m = piece("entry_upper_right_mask"), m2 = piece("entry_upper_left_mask"), rE = reg("entry_upper_right"), rM = reg("entry_upper_right_mask"), rE2 = reg("entry_upper_left"), rM2 = reg("entry_upper_left_mask");
    const mY = framed(eY, m, rE[0] - rM[0], rE[1] - rM[1], false), mX = framed(eX, m2, rE2[0] - rM2[0], rE2[1] - rM2[1], false);
    /* The doorway surround, whole and at its real height, standing on the floor: the arch and the jamb that the client draws in the alcove piece, whose
       mouldings run on from each other. It stops at the outside of its two jambs, with a black end to the moulding. Beside it, and above it, is just the wall.
       lo and hi are the surround's outer columns; the stub columns are the jamb that comes from the alcove piece. */
    const surround = (frame, raw, wall, lo, hi, stub) => {
        const o = { w: frame.w, h: frame.h + WALL_ADD, rgba: Buffer.alloc(frame.w * (frame.h + WALL_ADD) * 4) };
        const shift = wall === SEAMX ? phase * 16 : -phase * 16, base = wall === SEAMX ? 0 : 10, sx = x => x < base || x >= base + 128 ? x : base + (((x - base + shift) % 128) + 128) % 128;
        /* the piece is drawn on the wall's slant: a column further along is half as far up or down */
        const copyWall = (r, x) => { const X = sx(x), R = r + (wall === SEAMX ? (X - x) / 2 : -(X - x) / 2); if (X < wall.w && R >= 0 && R < wall.h) wall.rgba.copy(o.rgba, (r * o.w + x) * 4, (R * wall.w + X) * 4, (R * wall.w + X + 1) * 4); };
        for (let x = 0; x < o.w; x++) {
            if (x < lo || x > hi) { for (let r = 0; r < o.h; r++) copyWall(r, x); continue; }
            const src = stub(x) ? raw : frame; let top = -1;
            for (let j = 0; j < src.h; j++) if (src.rgba[(j * src.w + x) * 4 + 3] >= 128) { top = j; break; }
            if (top < 0) continue;
            for (let r = 0; r < o.h; r++) {
                const sy = r - WALL_ADD;
                if (sy < top) copyWall(r, x);
                else if (sy < src.h) { src.rgba.copy(o.rgba, (r * o.w + x) * 4, (sy * src.w + x) * 4, (sy * src.w + x + 1) * 4); if ((x === lo || x === hi) && sy < top + WALL_CAP) { const q = (r * o.w + x) * 4; o.rgba[q] = o.rgba[q + 1] = o.rgba[q + 2] = 0; o.rgba[q + 3] = 255; } }
            }
        }
        return o;
    };
    return { y: { alcove: tallPiece(eY, false), arch: surround(mY, eY, SEAMY, 28, 120, x => x >= 104) }, x: { alcove: tallPiece(eX, true), arch: surround(mX, eX, SEAMX, 17, 110, x => x <= 36) } };
})()), portalMemo.get(phase));
function drawPortal(w, axis, line, at, part) {
    const b = w.b, T = w.wallTop, art = portalArt(((at % 8) + 8) % 8)[axis][part];
    const p = axis === "x" ? w.S(at, line) : w.S(line, at), x0 = axis === "x" ? p[0] : p[0] - 138;
    /* the wall carries straight on either side, so its pieces' end posts aren't wanted */
    const i0 = axis === "x" ? 0 : 10, i1 = axis === "x" ? 128 : 138;
    for (let j = 0; j < art.h; j++) for (let i = i0; i < i1; i++) {
        const q = (j * art.w + i) * 4; if (art.rgba[q + 3] < 128) continue;
        /* solid black in the arch only ever hid the avatar in the client: it isn't drawn */
        if (part === "arch" && !art.rgba[q] && !art.rgba[q + 1] && !art.rgba[q + 2] && (i < 8 || i > art.w - 8)) continue;
        b.set(x0 + i, p[1] - T + j, [art.rgba[q], art.rgba[q + 1], art.rgba[q + 2]]);
    }
}

/* A small wall light to match the globe lamp: a little antique bronze plate, a short curved arm, a cup and a round glass globe.
   at(u, h) is a point on the wall; out is which way the wall faces on screen. */
const SG = { plate: ["3a2110", "6e4524", "ab7a44"], arm: ["54321a", "8c5c30"], cup: ["6e4524", "cc9f66"] };
function smallGlobe(w, at, out, o) {
    o = o || {};
    if (!o.drawn) {
        /* his picture, if there is one */
        const art = FloorLamps.wallLight(out, !!w.lightsOff || !!o.dead, o.colour, !!o.back);
        if (art) {
            const a0 = at(0, 0), bb = w.b;
            for (const [dx, dy, c, glass] of art) {
                const X = a0[0] + dx, Y = a0[1] + dy; bb.set(X, Y, c);
                if (X >= 0 && Y >= 0 && X < bb.w && Y < bb.h) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.keep) w.keep[Y * bb.w + X] = v; if (glass && w.glowing) w.glowing[Y * bb.w + X] = v; }
            }
            return;
        }
    }
    const b = w.b, A = at(0, 0), hx = h => { const v = parseInt(h, 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
    const paint = (X, Y, c, glow) => { b.set(X, Y, c); if (X >= 0 && Y >= 0 && X < b.w && Y < b.h) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.keep) w.keep[Y * b.w + X] = v; if (glow && w.glowing) w.glowing[Y * b.w + X] = v; } };
    const solid = (cells, colour) => {
        const seen = new Set(cells.map(q => q[0] + "," + q[1]));
        for (const [X, Y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!seen.has((X + dx) + "," + (Y + dy))) paint(X + dx, Y + dy, [0, 0, 0]);
        for (const q of cells) paint(q[0], q[1], colour(q[0], q[1], q));
    };
    /* the plate on the wall, following its slant */
    if (!o.back) { const plate = []; for (let u = -1; u <= 1; u++) for (let h = -3; h <= 3; h++) if (Math.abs(u) + Math.abs(h) < 4) { const P = at(u, h); plate.push([P[0], P[1], u, h]); }
    solid(plate, (X, Y, q) => hx(SG.plate[q[3] >= 2 ? 2 : q[2] * out < 0 ? 2 : q[2] === 0 ? 1 : 0])); }
    /* the arm: out and down from the plate, up into the cup */
    const cx = A[0] + out * 8, cup = A[1] - (o.back ? 5 : 1), arm = new Map(), endY = o.back ? -3 : 1, bendY = o.back ? 2 : 5;
    for (let t = 0; t <= 1.0001; t += .03) { const m = 1 - t, X = A[0] + Math.round(2 * m * t * out * 4 + t * t * out * 8), Y = A[1] + Math.round(2 * m * t * bendY + t * t * endY); arm.set(X + "," + Y, [X, Y]); }
    solid([...arm.values()], (X) => hx(SG.arm[(X - A[0]) * out < 4 ? 0 : 1]));
    /* the globe, a true circle, with the cup over its foot */
    const R = 3.5, Y0 = cup - 5, ball = [], lit = !w.lightsOff && !o.dead, ramp = lit ? FloorLamps.GLOBE_LIT : FloorLamps.GLOBE_OFF;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { if (i * i + j * j <= R * R) ball.push([cx + i, Y0 + j, i, j]); }
    solid(ball, (X, Y, q) => {
        const nx = q[2] / R, ny = -q[3] / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const t = lit ? .1 + .85 * nz * nz + .1 * Math.max(0, -nx * .6 + ny * .6) : .2 + .5 * Math.max(0, -nx * .6 + ny * .6 + nz * .5) + (q[2] === -1 && q[3] === -2 ? .5 : 0);
        const c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))))];
        return lit && o.colour ? FloorLamps.tintGlow(c, o.colour) : c;
    });
    for (const q of ball) { const X = q[0], Y = q[1], p = (Y * b.w + X) * 4; if (X >= 0 && Y >= 0 && X < b.w && Y < b.h && w.glowing) w.glowing[Y * b.w + X] = ((b.d[p] << 16) | (b.d[p + 1] << 8) | b.d[p + 2]) + 1; }
    const cupCells = []; for (let i = -2; i <= 2; i++) cupCells.push([cx + i, cup]); cupCells.push([cx - 1, cup + 1], [cx, cup + 1], [cx + 1, cup + 1]);
    solid(cupCells, X => hx(SG.cup[X < cx ? 1 : 0]));
}
/* on a pillar, one of its two faces: l is the lit face to the left, r the shaded one to the right. They lean as the room does. */
function pillarLight(w, tx, ty, face, colour, up) {
    /* l and r: the faces towards you. bl and br: the two turned away, 8 rows further up the pillar's diamond, drawn before the pillar so it hides their fixing. */
    const a = w.S(tx, ty), back = face[0] === "b", left = face.endsWith("l"), X = a[0] + (left ? -4 : 6), Y = a[1] + 8 - 102 + 44 - (back ? 8 : 0) - (up || 0), at = (u, h) => [X + u, Y + (left ? 1 : -1) * Math.floor(u / 2) - h];
    w.sprites.push({ depth: tx + ty + (back ? -.05 : .05), ftx: tx, fty: ty, draw: () => smallGlobe(w, at, left ? -1 : 1, { colour, back }) });
    const off = { l: [.5, 1.1], r: [1.1, .5], bl: [-.1, .5], br: [.5, -.1] }[face] || [.5, .5];
    w.lamps.push({ free: true, x: X, y: Y, tx: tx + off[0], ty: ty + off[1], colour, lz: w.z });
}

/* ---- half walls ----
   Where a floor drops to a lower part of itself, the real hallways show a low panelled wall with a rail along the top, which is
   the client's own wall_lower pieces. The piece is 8 tiles of panel plus a 6px end, and repeats from fixed points on the map. */
const LOWX = piece("wall_lower_left"), LOWY = piece("wall_lower_right"), HALF_WALL = 48;
/* which column of the piece: the panelling repeats every 4, and the piece's very ends have a black edge that mustn't repeat */
const lowX = at => 4 + (((at % 120) + 120) % 120), lowY = at => 10 + (((-at % 120) + 120) % 120);
const firstRow = (im, i) => { for (let j = 0; j < im.h; j++) if (im.rgba[(j * im.w + i) * 4 + 3] >= 128) return j; return -1; };
const lastRow = (im, i) => { for (let j = im.h - 1; j >= 0; j--) if (im.rgba[(j * im.w + i) * 4 + 3] >= 128) return j; return -1; };
function halfWallColumn(b, im, i, sx, sy, drop) {
    const r0 = firstRow(im, i), r1 = lastRow(im, i); if (r0 < 0) return;
    /* the rail goes down to the black line under it, so that line is never taken for panelling and repeated halfway down */
    let keepTop = 6; for (let r = r0 + 2; r < Math.min(r1, r0 + 10); r++) { const q = (r * im.w + i) * 4; if (im.rgba[q + 3] >= 128 && im.rgba[q] + im.rgba[q + 1] + im.rgba[q + 2] < 20) { keepTop = r - r0 + 1; break; } }
    const tall = r1 - r0 + 1, keepEnd = Math.min(Math.max(0, tall - keepTop), 6);
    for (let k = 0; k < drop; k++) {
        /* the rail at the top, the foot at the bottom, and the panels repeat between, however deep the drop */
        const r = k < keepTop ? r0 + k : k >= drop - keepEnd ? r1 - (drop - 1 - k) : r0 + keepTop + ((k - keepTop) % Math.max(1, tall - keepTop - keepEnd));
        const q = (r * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue;
        b.set(sx, sy + k, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]);
    }
}

/* The far end of a low wall, where it starts on its own: the client's own first columns, where the rail runs on past the panelling. Columns that are only rail are drawn as they are. */
function lowWallStart(b, im, cols, anchor, Q, H) {
    const a = firstRow(im, anchor);
    cols.forEach(([i, sx]) => {
        const r0 = firstRow(im, i), r1 = lastRow(im, i); if (r0 < 0) return;
        const sy = Q[1] - H + r0 - a;
        if (r1 - r0 < 10) { for (let r = r0; r <= r1; r++) { const q = (r * im.w + i) * 4; if (im.rgba[q + 3] >= 128) b.set(sx, sy + r - r0, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]); } }
        else halfWallColumn(b, im, i, sx, sy, H - (r0 - a));
    });
}

/* ---- retaining walls ----
   Where a floor drops, the edge is a real wall exactly as tall as the drop, built the way every wall is. From the floor up: the wood panelling, always
   its full height (a very low wall just shows less of it), then wallpaper, the only part that changes with the height. At the top it meets the floor
   above with the same moulding any wall has under a floor, so it sits cleanly under it. A door makes its whole straight stretch tall enough to hold it;
   that wall stands above the floor behind, so it ends in the wall's own cap. */
const DOOR_WALL = 80, WALL_CAP = 13;
const FLOOR_EDGE = ["000000", "af6947", "925030", "925030", "7d4122", "7d4122", "712f16", "000000", "5a1a06", "450e00", "450e00", "000000"].map(hex);
const railMemo = new Map();
function railRow(im, i) {
    const key = (im === TALLX ? "x" : im === TALLY ? "y" : im === SEAMX ? "sx" : "sy") + i; if (railMemo.has(key)) return railMemo.get(key);
    let r = firstRow(im, i) + WALL_CAP + 8;
    for (; r < im.h; r++) { const q = (r * im.w + i) * 4; if (im.rgba[q + 3] >= 128 && !im.rgba[q] && !im.rgba[q + 1] && !im.rgba[q + 2]) break; }
    railMemo.set(key, r - 3); return r - 3;
}
function shortWallColumn(b, im, i, floorRow, sx, fy, H, capped) {
    const top = firstRow(im, i); if (top < 0) return;
    const rail = railRow(im, i), wood = floorRow - rail + 1, edge = capped ? 0 : FLOOR_EDGE.length;
    for (let k = 0; k < H; k++) {
        const fromTop = H - 1 - k;
        if (fromTop < edge) { b.set(sx, fy - k, FLOOR_EDGE[fromTop]); continue; }
        const src = k < wood ? floorRow - k : rail - 1 - (k - wood);
        if (src < 0 || src >= im.h) continue;
        const q = (src * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue;
        b.set(sx, fy - k, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]);
    }
    if (capped) for (let n = 0; n < WALL_CAP; n++) { const q = ((top + n) * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; b.set(sx, fy - H - WALL_CAP + 1 + n, [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]); }
}

/* ---- the plan ---- */
/* d: doors in order, ["x", at] on the back wall, ["y", at] on the left wall.
   l: sconces, same form. props: scenery. band: carpet edges across y; null for bare floor. */
const WALL_ADD = 49, Z1 = 114 + WALL_ADD;
function tallPiece(im, right, top) {
    const o = { w: im.w, h: im.h + WALL_ADD, rgba: Buffer.alloc(im.w * (im.h + WALL_ADD) * 4) };
    const TOP = top === undefined ? 16 : top, P = 32;
    for (let x = 0; x < im.w; x++) {
        const sh = right ? Math.floor(x / 2) : Math.floor((im.w - 1 - x) / 2);
        for (let r = 0; r < o.h; r++) {
            const rel = r - sh;
            const src = rel < TOP ? rel : rel < TOP + WALL_ADD ? TOP + ((rel - TOP) % P) : rel - WALL_ADD;
            const sy = src + sh; if (sy < 0 || sy >= im.h) continue;
            im.rgba.copy(o.rgba, (r * o.w + x) * 4, (sy * im.w + x) * 4, (sy * im.w + x + 1) * 4);
        }
    }
    return o;
}
const TALLX = tallPiece(piece("wall_upper_right_basic"), true), TALLY = tallPiece(piece("wall_upper_left_basic"), false);
/* The piece's first columns are cut on a slant for the corner it would start in, which leaves a notch in the wall's top every
   8 tiles. Along the wall everything repeats 64 across and 32 down, so those columns are redrawn from further along it. A wall's
   true start still uses the client's own slanted cut. */
function seamless(im, right) {
    const o = { w: im.w, h: im.h, rgba: Buffer.from(im.rgba), above: {} }, N = 26, POST = 10, W = im.w - POST;
    /* both ends of the 128 columns of wall: x's run 0..127 with the post after, y's 10..137 with the post before */
    const first = right ? 0 : POST;
    for (let k = 0; k < N; k++) for (const [i, from] of [[first + k, first + k + 64], [first + W - 1 - k, first + W - 1 - k - 64]]) {
        const rise = (from - i) / 2 * (right ? 1 : -1);          // along the x wall the top falls to the right; along the y wall it climbs
        for (let r = 0; r < im.h; r++) {
            const R = r + rise; if (R < 0 || R >= im.h) continue;
            const q = (R * im.w + from) * 4;
            im.rgba.copy(o.rgba, (r * im.w + i) * 4, q, q + 4);
        }
        /* the slant runs the top of these columns off the top of the piece: those rows are kept beside it */
        for (let r = -Math.abs(rise); r < 0; r++) { const R = r + rise; if (R < 0 || R >= im.h) continue; const q = (R * im.w + from) * 4; if (im.rgba[q + 3] < 128) continue; (o.above[i] = o.above[i] || []).push([r, im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]); }
    }
    return o;
}
const SEAMX = seamless(TALLX, true), SEAMY = seamless(TALLY, false);

/* The lift. Every part of the surround is a box standing out from the wall, drawn with its
   front, its side and its top, and black round every shape, so it sits in the hall as solidly
   as the client's own furniture. Open, the opening looks into a lit iso cabin. */
function lift(w, x, y, o) {
    o = o || {};
    const b = w.b, DW = 48, DH = 76, cab = 3;
    const O = w.S(x, y);
    /* a point: u along the wall, h up it, v out from it toward you */
    const pt = (u, h, v) => [O[0] + u - v, O[1] + Math.floor(u / 2) + Math.floor(v / 2) - h];
    const put = (u, h, v, c) => { const q = pt(u, h, v); b.set(q[0], q[1], c); };
    /* a solid box: from u0..u1, h0..h1, standing v out. fn colours the front. */
    const box = (u0, u1, h0, h1, v, fn, sideC, topC) => {
        /* right side, then top, then front; the black goes on last */
        for (let t = 0; t <= v; t++) for (let h = h0; h <= h1; h++) { const c = (t === v || h === h0 || h === h1) ? C.k : (sideC || C.d1); put(u1, h, t, c); put(u1, h, t + .5, c); }
        for (let t = 0; t <= v; t++) for (let u = u0; u <= u1; u++) { const c = (u === u0 || u === u1 || t === 0) ? C.k : (topC || C.d6); const q = pt(u, h1, t); b.set(q[0], q[1], c); b.set(q[0] - 1, q[1], c); }
        for (let u = u0; u <= u1; u++) for (let h = h0; h <= h1; h++) {
            let c = (u === u0 || u === u1 || h === h0 || h === h1) ? C.k : fn(u, h);
            if (c) put(u, h, v, c);
        }
    };
    /* the opening's mask, so the cabin can only be seen through it */
    const mask = new Set();
    for (let u = 0; u < DW; u++) for (let h = 0; h < DH; h++) { const q = pt(u, h, 0); mask.add(q[0] + "," + q[1]); }
    const inMask = (X, Y, c) => { if (mask.has(X + "," + Y)) b.set(X, Y, c); };

    if (o.open || o.slide > 0) {
        const back = w.S(x, y - cab), left = w.S(x, y);
        const wood = [hex("6a3b1f"), hex("8a5230"), hex("9c6038"), hex("b87a4a")];
        const lp = w.S(x + 1.5, y + .5); w.lamps.push({ free: true, tx: x + 1.5, ty: y + .5, lz: w.z, x: lp[0], y: lp[1] - 40 });
        /* back wall with panels, a mirror and a handrail */
        for (let u = -40; u < DW + 90; u++) for (let h = 0; h < DH + 40; h++) {
            const X = back[0] + u, Y = back[1] + Math.floor(u / 2) - h;
            let c = wood[1 + ((u >> 3) & 1)];
            if (((u % 16) + 16) % 16 === 0) c = wood[0];
            if (h === 34 || h === 35) c = C.b4; else if (h === 33 || h === 36) c = C.k;
            if (h > 40 && h < 72 && u >= 8 && u < 36) { c = ((u + h) % 9 < 2) ? hex("dfe8e4") : hex("9fb0ac"); if (u === 8 || u === 35 || h === 41 || h === 71) c = C.b2; if (u === 7 || u === 36 || h === 40 || h === 72) c = C.k; }
            if (h === 0) c = C.k;
            inMask(X, Y, c);
        }
        /* side wall with the button panel */
        for (let u = 0; u <= cab * 16; u++) for (let h = 0; h < DH + 40; h++) {
            const X = left[0] + u, Y = left[1] - Math.floor(u / 2) - h;
            let c = wood[(u % 16 < 2) ? 0 : 3];
            if (h === 34 || h === 35) c = C.b4; else if (h === 33 || h === 36) c = C.k;
            if (h >= 44 && h <= 62 && u >= 18 && u <= 28) { c = C.b2; if (u === 18 || u === 28 || h === 44 || h === 62) c = C.k; else if ((u + h) % 4 === 0) c = hex("fff4cf"); }
            if (h === 0) c = C.k;
            inMask(X, Y, c);
        }
        /* inlaid floor */
        for (let a = 0; a < 96; a++) for (let v = 0; v <= cab * 16; v++) {
            const X = back[0] + a - v, Y = back[1] + Math.floor(a / 2) + Math.floor(v / 2);
            let c = ((a >> 3) + (v >> 3)) % 2 ? hex("6b4a30") : hex("8a6642");
            if (v < 2) c = C.k; else if (v < 4) c = C.b2;
            inMask(X, Y, c); inMask(X - 1, Y, c);
        }
        /* the lit panel above, seen from below the head */
        for (let u = 0; u < DW; u++) for (let h = DH - 7; h < DH; h++) { const q = pt(u, h, 0); b.set(q[0], q[1], h === DH - 7 ? C.k : hex("fff0c8")); }
    }
    if (!o.open) {
        /* two doors, set back in the opening, with a black seam and an outline. Opening, each slides away into its own side. */
        const slid = Math.round((o.slide || 0) * DW / 2);
        for (let u = 0; u < DW; u++) for (let h = 0; h < DH; h++) {
            const leaf = u < DW / 2 ? 0 : 1, W = DW / 2, lu = leaf ? u - DW / 2 - slid : u + slid;
            if (lu < 0 || lu >= W) continue;
            let c = C.d3;
            if (lu === 1) c = C.d5; else if (lu === W - 2) c = C.d1;
            const panel = (a, e) => h >= a && h < e && lu >= 4 && lu < W - 3;
            if (panel(38, 72) || panel(11, 32)) {
                const a = h >= 38 ? 38 : 11, e = h >= 38 ? 72 : 32;
                if (lu === 4 || h === e - 1) c = C.d0; else if (lu === W - 4 || h === a) c = C.d5; else if (lu === 5 || h === e - 2) c = C.d1; else c = (lu + (h >> 1)) % 6 === 0 ? C.d3 : C.d4;
            }
            /* a small glazed port with a brass rim and a black line */
            if (h >= 52 && h <= 67 && lu >= 7 && lu <= W - 7) {
                const edge = h === 52 || h === 67 || lu === 7 || lu === W - 7, rim = h === 53 || h === 66 || lu === 8 || lu === W - 8;
                c = edge ? C.k : rim ? C.b3 : ((lu + h) % 6 === 0 ? hex("a8c4bc") : hex("3e524e"));
            }
            /* brass kick plate and pull */
            if (h >= 2 && h <= 7) c = h === 7 ? C.b4 : h === 2 ? C.b1 : C.b2;
            if (h === 8 || h === 1) c = C.k;
            if (h >= 26 && h <= 40) { const pu = leaf ? 2 : W - 3; if (lu === pu) c = C.b4; if (lu === pu + (leaf ? 1 : -1)) c = C.k; }
            if (h === 0 || h === DH - 1 || u === 0 || u === DW - 1 || lu === (leaf ? 0 : W - 1)) c = C.k;
            put(u, h, 0, c);
        }
    }
    /* a brass threshold let into the floor */
    for (let u = 0; u < DW; u++) for (let v = 0; v < 8; v++) { const c = v < 1 ? C.k : v < 3 ? C.b4 : v < 6 ? C.b2 : v < 7 ? C.b1 : C.k; const q = pt(u, 0, v); b.set(q[0], q[1], c); b.set(q[0] - 1, q[1], c); }

    /* side posts: reeded wood on a plinth, standing out 4 */
    const post = (u, h) => { const k = ((u % 3) + 3) % 3; if (h <= 11) return h === 11 ? C.d7 : h === 10 ? C.k : C.d2; return k === 0 ? C.d3 : k === 1 ? C.d5 : C.d4; };
    box(-10, -1, 0, DH + 2, 4, post, C.d1, C.d6);
    box(DW, DW + 9, 0, DH + 2, 4, post, C.d1, C.d6);
    /* the brass strip inside each post */
    for (let h = 1; h < DH + 2; h++) { put(-1, h, 4, C.b4); put(-2, h, 4, C.b2); put(DW, h, 4, C.b1); put(DW + 1, h, 4, C.b2); }
    /* the lintel over the opening */
    box(-10, DW + 9, DH + 2, DH + 13, 5, (u, h) => (h >= DH + 11) ? C.d6 : (h <= DH + 4) ? (h === DH + 3 ? C.b1 : C.b3) : ((u % 4) === 0 ? C.d3 : C.d4), C.d1, C.d7);
    /* a stepped cornice, each step wider and standing further out */
    box(-13, DW + 12, DH + 13, DH + 16, 7, () => C.d4, C.d2, C.d7);
    box(-15, DW + 14, DH + 16, DH + 19, 9, (u, h) => h === DH + 18 ? C.d6 : C.d5, C.d2, hex("e0a058"));
    /* the indicator: a square brass-framed panel with an ivory dial, on the cornice */
    const P0 = 7, P1 = DW - 8, H0 = DH + 19, H1 = DH + 40;
    box(P0, P1, H0, H1, 5, (u, h) => {
        const cx = (P0 + P1) / 2, du = u - cx, dv = h - (H0 + 4), r = Math.sqrt(du * du + dv * dv);
        if (u < P0 + 3 || u > P1 - 3 || h < H0 + 3 || h > H1 - 3) return (u === P0 + 1 || h === H1 - 1) ? C.b4 : (u === P1 - 1 || h === H0 + 1) ? C.b1 : C.b2;
        if (r > 12.5) return C.d1;
        if (r > 11.5) return C.k;
        if (dv < 0) return C.d1;
        if (r < 2) return C.k;
        /* the needle, and five tick marks round the arc */
        if (Math.abs(du - dv * .55) < .8 && r < 10) return C.k;
        const ang = Math.atan2(du, dv) / Math.PI * 4;
        if (r > 8.5 && Math.abs(ang - Math.round(ang)) < .14) return hex("6a5c3e");
        return hex("f0e6c4");
    }, C.d1, C.d6);
    /* a cap on the panel */
    box(P0 - 2, P1 + 2, H1, H1 + 2, 7, () => C.d5, C.d2, C.d7);
    /* the call plate on the wall to the right */
    box(DW + 15, DW + 25, 34, 56, 1, (u, h) => {
        if (u === DW + 16 || h === 55) return C.b4; if (u === DW + 24 || h === 35) return C.b1;
        const cu = DW + 20;
        if (Math.abs(u - cu) <= 2 && h >= 47 && h <= 51) return (Math.abs(u - cu) === 2 || h === 47 || h === 51) ? C.k : hex("fff0c0");
        if (Math.abs(u - cu) <= 2 && h >= 39 && h <= 43) return (Math.abs(u - cu) === 2 || h === 39 || h === 43) ? C.k : C.b3;
        return C.b2;
    }, C.b1, C.b4);
}
function plan() {
    const L = (id, way, patches, extra) => ({ id, way, patches, ...(extra || {}) });
    const levels = [];
    /* the top floor: one way in */
    levels.push(L("F3", "mauve", [
        { x0: 116, x1: 128, y0: -34, y1: -26, z: 3 * Z1, d: [["x", 121]], l: [["x", 118.5], ["x", 125]], props: [["sofa", 124, -34]] },
        { x0: 92, x1: 116, y0: -44, y1: -26, z: 3 * Z1, d: [["y", -38], ["x", 95], ["x", 102], ["x", 110]], l: [["x", 93.5], ["x", 100], ["x", 108], ["x", 114.5]], props: [["plant", 113, -44], ["lamp", 95, -30]] }
    ], { name: "Floor 3", rugs: [{ x0: 94, x1: 114, y0: -42, y1: -38 }, { x0: 105, x1: 109, y0: -40, y1: -35 }] }));
    levels.push(L("F2", "sage", [
        { x0: 92, x1: 116, y0: -26, y1: -18, z: 2 * Z1, d: [["x", 94]], l: [["x", 98], ["x", 110]], props: [["lamp", 113, -21]] },
        { x0: 60, x1: 72, y0: -26, y1: -16, z: 2 * Z1, d: [["y", -20], ["x", 63]], l: [["x", 68]], props: [["shelf", 66, -26], ["plant", 70, -26]] },
        { x0: 72, x1: 92, y0: -26, y1: -10, z: 2 * Z1, d: [["x", 75], ["x", 85]], l: [["x", 73.5], ["x", 81], ["x", 89]] },
        { x0: 116, x1: 134, y0: -26, y1: -10, z: 2 * Z1, d: [["x", 118], ["x", 127]], l: [["x", 117], ["x", 124.5], ["x", 131]], tele: [132, -26] },
        { x0: 134, x1: 150, y0: -28, y1: -16, z: 2 * Z1, d: [["x", 139]], l: [["x", 136.5], ["x", 144]], props: [["sofa", 144, -28]] }
    ], { name: "Floor 2", rugs: [{ x0: 62, x1: 90, y0: -24, y1: -20 }, { x0: 94, x1: 148, y0: -24, y1: -20 }, { x0: 77, x1: 81, y0: -21, y1: -19 }, { x0: 121, x1: 125, y0: -21, y1: -19 }] }));
    levels.push(L("F1", "slate", [
        { x0: 26, x1: 50, y0: -18, y1: -6, z: Z1, d: [["y", -12], ["x", 29], ["x", 36], ["x", 43]], l: [["x", 27.5], ["x", 34], ["x", 41], ["x", 48]], props: [["plant", 47, -18]] },
        { x0: 92, x1: 116, y0: -18, y1: -8, z: Z1, d: [["x", 96], ["x", 103], ["x", 110]], l: [["x", 94.5], ["x", 101], ["x", 108], ["x", 114.5]] },
        { x0: 10, x1: 26, y0: -16, y1: 0, z: Z1, d: [["x", 13], ["x", 20]], l: [["x", 11.5], ["x", 18.5], ["x", 24]] },
        { x0: 50, x1: 72, y0: -16, y1: 0, z: Z1, d: [["x", 52], ["x", 66]], l: [["x", 56], ["x", 62], ["x", 70]], props: [["sofa", 58, -16]], tele: [70, -16] },
        { x0: 72, x1: 92, y0: -10, y1: 2, z: Z1, d: [["x", 87]], l: [["x", 74], ["x", 85], ["x", 90]] },
        { x0: 116, x1: 134, y0: -10, y1: 0, z: Z1, d: [], l: [["x", 117.5], ["x", 131]], props: [["plant", 132, -10]] },
        { x0: 134, x1: 160, y0: -16, y1: 2, z: Z1, d: [["x", 138], ["x", 146]], l: [["x", 136], ["x", 143], ["x", 151]], props: [["sofa", 152, -16]] }
    ], { name: "Floor 1", rugs: [{ x0: 12, x1: 48, y0: -14, y1: -10 }, { x0: 52, x1: 72, y0: -14, y1: -10 }, { x0: 94, x1: 114, y0: -16, y1: -12 }, { x0: 136, x1: 158, y0: -14, y1: -10 }, { x0: 15, x1: 19, y0: -11, y1: -9 }, { x0: 151, x1: 155, y0: -11, y1: -7 }, { x0: 118, x1: 132, y0: -8, y1: -4 }] }));

    /* Ground: the wall still jogs in and out, but toward you it opens into one huge lobby */
    const NEAR = 90;
    const pillars = []; for (let x = 8; x < 200; x += 16) for (let y = 16; y < 76; y += 16) pillars.push(["pillar", x, y]);
    const island = (x, y) => [["sofa", x, y], ["table", x + 1, y + 2], ["lamp", x - 2, y], ["plant", x + 4, y], ["chair", x + 3, y + 3]];
    levels.push(L("G", "oxblood", [
        { x0: 26, x1: 50, y0: -6, y1: NEAR, z: 0, d: [["y", -2], ["x", 30], ["x", 37], ["x", 44]], l: [["x", 28.5], ["x", 35], ["x", 42], ["x", 48]], props: [["sofa", 33, -6], ["table", 40, -5], ["lamp", 36, -4], ["plant", 27, -6], ...island(36, 28), ...island(36, 52)] },
        { x0: 92, x1: 116, y0: -8, y1: NEAR, z: 0, d: [["x", 95], ["x", 110]], l: [["x", 93.5], ["x", 98.5], ["x", 107], ["x", 113.5]], medal: [102, 14], props: [["statue", 103, -8], ["fountain", 98, 30], ["plant", 93, 40], ["lamp", 94, 8], ["lamp", 113, 8], ...island(104, 44)], tele: [109, -8] },
        { x0: 0, x1: 26, y0: 0, y1: NEAR, z: 0, d: [["y", 8], ["y", 15], ["y", 22], ["x", 23]], l: [["x", 0.5], ["x", 11], ["x", 21], ["y", 11], ["y", 18]], lift: 2, props: [["plant", 12, 0], ...island(10, 26), ...island(16, 50)] },
        { x0: 50, x1: 72, y0: 0, y1: NEAR, z: 0, d: [["x", 51]], l: [["x", 55], ["x", 70.5]], props: island(60, 18) },
        { x0: 72, x1: 92, y0: 2, y1: NEAR, z: 0, d: [["x", 75], ["x", 82], ["x", 88]], l: [["x", 74], ["x", 80.5], ["x", 86.5], ["x", 91]], props: island(80, 36) },
        { x0: 116, x1: 134, y0: 0, y1: NEAR, z: 0, d: [["x", 118], ["x", 125]], l: [["x", 117], ["x", 123.5], ["x", 131]], props: [["water", 131, 0], ...island(124, 24)] },
        { x0: 134, x1: 310, y0: 2, y1: NEAR, z: 0, d: [["x", 137], ["x", 144], ["x", 158]], l: [["x", 135.5], ["x", 142], ["x", 149], ["x", 156], ["x", 164]], tele: [165, 2], props: [["plant", 168, 2], ...island(148, 22), ...island(172, 36)] }
    ], { name: "Ground", pillars, rugs: [
        { x0: 15, x1: 19, y0: -1, y1: 8 }, { x0: 59, x1: 63, y0: -1, y1: 8 }, { x0: 151, x1: 155, y0: 1, y1: 10 }, { x0: 92, x1: 98, y0: -5, y1: -1 },
        { x0: 4, x1: 196, y0: 8, y1: 14 },
        { x0: 96, x1: 112, y0: 14, y1: 26 },
        { x0: 6, x1: 24, y0: 24, y1: 34 }, { x0: 32, x1: 50, y0: 26, y1: 36 }, { x0: 56, x1: 72, y0: 18, y1: 26 }, { x0: 76, x1: 90, y0: 34, y1: 44 },
        { x0: 100, x1: 116, y0: 42, y1: 52 }, { x0: 120, x1: 136, y0: 22, y1: 32 }, { x0: 144, x1: 160, y0: 20, y1: 30 }, { x0: 168, x1: 184, y0: 34, y1: 44 },
        { x0: 12, x1: 28, y0: 48, y1: 58 }, { x0: 32, x1: 48, y0: 50, y1: 60 }
    ] }));
    /* pillars are drawn with the first rectangle they stand on */
    const G = levels.find(l => l.id === "G");
    for (const p of G.pillars) { const P = G.patches.find(q => p[1] >= q.x0 && p[1] < q.x1); P.props.push(p); }

    /* closed floors above, following the real floors' edges exactly */
    const byId = id => levels.find(l => l.id === id);
    const real = { 0: byId("G"), 1: byId("F1"), 2: byId("F2"), 3: byId("F3") };
    const xs = new Set([-300, 310]);
    for (const k in real) for (const P of real[k].patches) { xs.add(P.x0); xs.add(P.x1); }
    const X = [...xs].sort((p, q) => p - q);
    const covering = (lv, a) => lv.patches.find(P => a >= P.x0 && a < P.x1);
    const merge = list => { const o = []; for (const P of list) { const l = o[o.length - 1]; if (l && l.x1 === P.x0 && l.y0 === P.y0 && l.y1 === P.y1 && l.z === P.z) l.x1 = P.x1; else o.push(P); } return o; };
    const ways = ["slate", "sage", "mauve", "teal", "clay", "ash", "ochre", "oxblood"];
    let backs = {};
    for (let i = 0; i < X.length - 1; i++) { const a = X[i], g = covering(real[0], a); backs[a] = g ? g.y0 : 0; }
    const out = [];
    for (let k = 1; k <= 6; k++) {
        const list = [], next = {};
        for (let i = 0; i < X.length - 1; i++) {
            const a = X[i], c = X[i + 1], r = real[k] && covering(real[k], a);
            if (r) { next[a] = r.y0; continue; }
            const y1 = backs[a], y0 = y1 - 12;
            /* left of the lobby's end wall, a closed floor runs on towards you above it */
            list.push({ x0: a, x1: c, y0, y1: (a < 0 && k === 1) ? NEAR : y1, z: k * Z1, blank: true });
            next[a] = y0;
        }
        const pats = merge(list);
        out.push({ k, lv: L("C" + k, ways[(k + 2) % 8], pats, { closed: true, dim: Math.max(.34, .6 - k * .04), rugs: pats.filter(P => P.y1 - P.y0 >= 8 && P.x1 - P.x0 >= 12).map(P => ({ x0: P.x0 + 2, x1: P.x1 - 2, y0: P.y0 + 2, y1: P.y0 + 6 })) }), real: real[k] });
        backs = next;
    }
    const seq = [];
    for (let i = out.length - 1; i >= 0; i--) { seq.push(out[i].lv); if (out[i].real) seq.push(out[i].real); }
    seq.push(real[0]);

    /* embedded stairs: each cuts a slot back into the terrace, and a matching hole in the floor above */
    const STAIRS = [
        { kind: "straight", low: "G", up: "F1", a: 14, b: 20, y: 0, z: 0, label: "Up to Floor 1", signX: 11 },
        { kind: "turn", low: "G", up: "F1", a: 58, b: 64, y: 0, z: 0, label: "Up to Floor 1" },
        { kind: "side", low: "G", up: "F1", a: -6, b: 0, x: 92, z: 0, label: "Up to Floor 1" },
        { kind: "straight", low: "G", up: "F1", a: 150, b: 156, y: 2, z: 0, label: "Up to Floor 1" },
        { kind: "straight", low: "F1", up: "F2", a: 76, b: 82, y: -10, z: Z1, label: "Up to Floor 2", signX: 72.5 },
        { kind: "straight", low: "F1", up: "F2", a: 120, b: 126, y: -10, z: Z1, label: "Up to Floor 2", signX: 123 + 8 },
        { kind: "turn", low: "F2", up: "F3", a: 104, b: 110, y: -26, z: 2 * Z1, label: "Up to Floor 3" }
    ];
    cutStairs(byId, STAIRS);
    return seq;
}

function cutStairs(byId, STAIRS) {
    const punch = (lv, r) => {
        const out2 = [];
        for (const P of lv.patches) {
            if (r.x1 <= P.x0 || r.x0 >= P.x1 || r.y1 <= P.y0 || r.y0 >= P.y1) { out2.push(P); continue; }
            const cut = (x0, x1, y0, y1) => { if (x1 > x0 && y1 > y0) { const c = { ...P, x0, x1, y0, y1 }; const inW = dd => dd[0] === "x" ? (y0 === P.y0 && dd[1] >= x0 && dd[1] < x1) : (x0 === P.x0 && dd[1] > y0 && dd[1] <= y1); if (P.d) c.d = P.d.filter(inW); if (P.l) c.l = P.l.filter(inW); if (P.props) c.props = P.props.filter(p => p[1] >= x0 && p[1] < x1 && p[2] >= y0 && p[2] < y1); if (P.tele) c.tele = (P.tele[0] >= x0 && P.tele[0] < x1 && P.tele[1] >= y0 && P.tele[1] < y1) ? P.tele : null; if (P.medal) c.medal = (P.medal[0] >= x0 && P.medal[0] < x1 && P.medal[1] >= y0 && P.medal[1] < y1) ? P.medal : null; out2.push(c); } };
            const mx0 = Math.max(r.x0, P.x0), mx1 = Math.min(r.x1, P.x1);
            cut(P.x0, mx0, P.y0, P.y1); cut(mx1, P.x1, P.y0, P.y1);
            cut(mx0, mx1, P.y0, Math.max(r.y0, P.y0)); cut(mx0, mx1, Math.min(r.y1, P.y1), P.y1);
        }
        lv.patches = out2;
        (lv.holes = lv.holes || []).push(r);
    };
    /* The carpet comes from the rugs you've laid: a rug that reaches the foot or the head of a flight runs
       up it, as wide as it is there. No rug at either end, and the stairs are bare polished wood. */
    const onRug = (lv, X, Y) => (lv.rugs || []).some(r => X >= r.x0 && X < r.x1 && Y >= r.y0 && Y < r.y1);
    const rugSpan = (c0, c1, hit) => { let lo = null, hi = null; for (let c = c0; c < c1; c++) if (hit(c)) { if (lo === null) lo = c; hi = c + 1; } return lo === null ? null : [lo, hi]; };
    const span = (c0, c1, hit) => { let lo = null, hi = null; for (let c = c0 + 1; c < c1 - 1; c++) if (hit(c)) { if (lo === null) lo = c; hi = c + 1; } return lo === null ? null : [lo, hi]; };
    for (const st of STAIRS) {
        const low = byId(st.low), up = byId(st.up), way = low.way;
        const known = low.rugs || up.rugs;
        if (st.kind === "straight") {
            punch(up, { x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
            const carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, x => onRug(low, x, st.y) || onRug(low, x, st.y - 1) || onRug(up, x, st.y - 11) || onRug(up, x, st.y - 10));
            low.patches.push({ x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y, z: st.z, notch: true, upLv: up, sf: [{ axis: "y", c0: st.a, c1: st.b, dTop: st.y - 10, steps: 20, zB: st.z, carpet, way, topExtra: STAIR_TOP }] });
            (low.stairSigns = low.stairSigns || []).push({ x: st.signX || st.a - 2, y: st.y, z: st.z, name: st.label, sign: st.sign, mid: (st.a + st.b) / 2 });
        } else if (st.kind === "turn") {
            punch(up, { x0: st.a, x1: st.b, y0: st.y - 10, y1: st.y });
            punch(up, { x0: st.a - 4, x1: st.a, y0: st.y - 10, y1: st.y - 6 });
            const Y = st.y, carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, x => onRug(low, x, Y) || onRug(low, x, Y - 1) || onRug(up, x, Y - 11) || onRug(up, x, Y - 10)) || (span(Y - 10, Y - 6, y => onRug(up, st.a - 5, y)) && [st.a + 1, st.b - 1]);
            const rugged = !!carpet, head = rugSpan(Y - 10, Y - 6, y => onRug(up, st.a - 5, y)) || [Y - 9, Y - 7], turnRug = rugged ? rugField([{ x0: st.a, x1: carpet[1], y0: head[0], y1: head[1] }, { x0: st.a - 2, x1: st.a, y0: head[0], y1: head[1] }, { x0: carpet[0], x1: carpet[1], y0: head[1], y1: Y - 3 }]) : null;
            low.patches.push({ x0: st.a - 4, x1: st.a, y0: Y - 10, y1: Y - 6, z: st.z, notch: true, upLv: up, sf: [{ axis: "x", c0: Y - 10, c1: Y - 6, dTop: st.a - 4, steps: 8, zB: st.z + 96, carpet: rugged ? head : null, way, near: false, topExtra: STAIR_TOP, run: st.b - st.a }] });
            low.patches.push({ x0: st.a, x1: st.b, y0: Y - 10, y1: Y, z: st.z, notch: true, upLv: up, sf: [
                { landing: { x0: st.a, x1: st.b, y0: Y - 10, y1: Y - 6, z: st.z + 96, rug: turnRug } },
                { axis: "y", c0: st.a, c1: st.b, dTop: Y - 6, steps: 12, zB: st.z, carpet, way, landRun: 4 }
            ] });
            (low.stairSigns = low.stairSigns || []).push({ x: st.b + 6, y: st.y, z: st.z, name: st.label, sign: st.sign, mid: (st.a + st.b) / 2 });
        } else if (st.kind === "sideturn") {
            /* the turning flight mirrored: up -x through a top-left wall to a landing, then -y into the floor above */
            punch(up, { x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
            punch(up, { x0: st.x - 10, x1: st.x - 6, y0: st.a - 4, y1: st.a });
            const X = st.x, carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, y => onRug(low, X, y) || onRug(low, X - 1, y) || onRug(up, X - 11, y) || onRug(up, X - 10, y)) || (span(X - 10, X - 6, x => onRug(up, x, st.a - 5)) && [st.a + 1, st.b - 1]);
            const rugged = !!carpet, head = rugSpan(X - 10, X - 6, x => onRug(up, x, st.a - 5)) || [X - 9, X - 7], turnRug = rugged ? rugField([{ x0: head[0], x1: head[1], y0: st.a, y1: carpet[1] }, { x0: head[0], x1: head[1], y0: st.a - 2, y1: st.a }, { x0: head[1], x1: X - 3, y0: carpet[0], y1: carpet[1] }]) : null;
            low.patches.push({ x0: X - 10, x1: X - 6, y0: st.a - 4, y1: st.a, z: st.z, notch: true, upLv: up, sf: [{ axis: "y", c0: X - 10, c1: X - 6, dTop: st.a - 4, steps: 8, zB: st.z + 96, carpet: rugged ? head : null, way, near: false, topExtra: STAIR_TOP, run: st.b - st.a }] });
            low.patches.push({ x0: X - 10, x1: X, y0: st.a, y1: st.b, z: st.z, notch: true, upLv: up, sf: [
                { landing: { x0: X - 10, x1: X - 6, y0: st.a, y1: st.b, z: st.z + 96, rug: turnRug, edgeX: true } },
                { axis: "x", c0: st.a, c1: st.b, dTop: X - 6, steps: 12, zB: st.z, carpet, way, landRun: 4 }
            ] });
        } else {
            punch(up, { x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b });
            const carpet = !known ? [st.a + 1, st.b - 1] : span(st.a, st.b, y => onRug(low, st.x, y) || onRug(low, st.x - 1, y) || onRug(up, st.x - 11, y) || onRug(up, st.x - 10, y));
            low.patches.push({ x0: st.x - 10, x1: st.x, y0: st.a, y1: st.b, z: st.z, notch: true, upLv: up, sf: [{ axis: "x", c0: st.a, c1: st.b, dTop: st.x - 10, steps: 20, zB: st.z, carpet, way, topExtra: STAIR_TOP }] });
        }
    }
}

/* ---- from the editor's map file ----
   A map is levels of 2-tile cells (so floors always fall on whole parquet squares), plus what stands
   on them. Closed floors above the real ones are still worked out here, from the real floors' edges. */
function rectify(cells) {
    const rows = new Map();
    for (const c of cells) { const [cx, cy] = c.split(",").map(Number); if (!rows.has(cy)) rows.set(cy, []); rows.get(cy).push(cx); }
    const open = new Map(), out = [];
    for (const cy of [...rows.keys()].sort((a, b) => a - b)) {
        const xs = rows.get(cy).sort((a, b) => a - b), runs = [];
        for (const x of xs) { const l = runs[runs.length - 1]; if (l && l[1] === x) l[1] = x + 1; else runs.push([x, x + 1]); }
        const seen = new Set();
        for (const [a, b] of runs) {
            const key = a + "," + b, o = open.get(key);
            if (o && o.y1 === cy) { o.y1 = cy + 1; seen.add(key); }
            else { const r = { x0: a, x1: b, y0: cy, y1: cy + 1 }; out.push(r); open.set(key, r); seen.add(key); }
        }
    }
    return out.map(r => ({ x0: r.x0 * 2, x1: r.x1 * 2, y0: r.y0 * 2, y1: r.y1 * 2 }));
}
/* A floor can step up or down within itself, as the real hallways do: l.rise holds a cell's height in pixels, a whole number of
   steps, and the floor is cut into rectangles at each height. A floor with none comes out exactly as before. */
const OLD_HEIGHT = 32;
function patchesByHeight(l) {
    const hs = l.rise || Object.fromEntries(Object.entries(l.heights || {}).map(([k, v]) => [k, v * OLD_HEIGHT])), groups = new Map();
    for (const c of l.cells) { const h = hs[c] || 0; if (!groups.has(h)) groups.set(h, []); groups.get(h).push(c); }
    const out = [];
    for (const [h, cs] of [...groups.entries()].sort((a, c) => a[0] - c[0])) for (const r of rectify(cs)) out.push({ ...r, z: l.k * Z1 + h, up: h });
    return out;
}
function fromMap(map, names) {
    const real = [...map.levels].sort((a, c) => a.k - c.k);
    const lvls = real.map(l => ({ id: l.id, name: l.name, way: l.colour ? "hex:" + l.colour : l.way, k: l.k, rugs: (l.rugs || []).map(r => ({ ...r })), medals: l.medals || [],
        patches: patchesByHeight(l).map(r => ({ ...r, l: [], props: [], teles: [], dn: [] })), src: l }));
    for (const l of lvls) l.below = lvls.find(q => q.k === l.k - 1) || null;
    const byId = id => lvls.find(l => l.id === id);
    const set = lv => { const c = new Set(lv.src.cells); return (X, Y) => c.has(Math.floor(X / 2) + "," + Math.floor(Y / 2)); };

    /* closed floors above, column by column */
    const top = Math.max(...real.map(l => l.k));
    const COLS = []; for (let x = -320; x < 340; x += 2) COLS.push(x);
    const colY = (lv) => { const m = new Map(); for (const c of lv.src.cells) { const [cx, cy] = c.split(",").map(Number); const x = cx * 2, y = cy * 2; if (!m.has(x) || y < m.get(x)) m.set(x, y); } return m; };
    const merge = list => { const o = []; for (const P of list.sort((a, c) => a.x0 - c.x0)) { const l = o[o.length - 1]; if (l && l.x1 === P.x0 && l.y0 === P.y0 && l.y1 === P.y1) l.x1 = P.x1; else o.push(P); } return o; };
    const ways = ["slate", "sage", "mauve", "teal", "clay", "ash", "ochre", "oxblood"];
    const ground = lvls.find(l => l.k === 0);
    const gc = ground ? colY(ground) : new Map();
    const gxs = [...gc.keys()]; const minG = gxs.length ? Math.min(...gxs) : 0, maxG = gxs.length ? Math.max(...gxs) : 0;
    let backs = new Map(); for (const x of COLS) backs.set(x, gc.has(x) ? gc.get(x) : (x < minG ? gc.get(minG) : gc.get(maxG)) || 0);
    const seq = []; const stack = [];
    for (let k = 1; k <= top + 4; k++) {
        const r = lvls.find(l => l.k === k), rc = r ? colY(r) : new Map(), list = [], next = new Map();
        for (const x of COLS) {
            if (rc.has(x)) { next.set(x, rc.get(x)); continue; }
            const y1 = backs.get(x), y0 = y1 - 12;
            list.push({ x0: x, x1: x + 2, y0, y1: (x < minG && k === 1) ? 90 : y1, z: k * Z1, blank: true });
            next.set(x, y0);
        }
        const pats = merge(list);
        stack.push({ closed: { id: "C" + k, way: ways[(k + 2) % 8], patches: pats, closed: true, dim: Math.max(.34, .6 - k * .04), rugs: pats.filter(P => P.y1 - P.y0 >= 8 && P.x1 - P.x0 >= 12).map(P => ({ x0: P.x0 + 2, x1: P.x1 - 2, y0: P.y0 + 2, y1: P.y0 + 6 })) }, real: r });
        backs = next;
    }
    /* The closed, unwalkable floors around the real ones are off for now: past the real floors it's black.
       Set map.closedFloors to true to bring them back. */
    for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].real) seq.push(stack[i].real); if (map.closedFloors) seq.push(stack[i].closed); }
    if (ground) seq.push(ground);
    /* floors below Ground, top down like the rest */
    for (const l of lvls.filter(q => q.k < 0).sort((a, c) => c.k - a.k)) seq.push(l);

    /* stairs: each one cuts its slot and its hole */
    const stairs = (map.stairs || []).filter(st => byId(st.low) && byId(st.up)).map(st => ({ ...st, z: byId(st.low).k * Z1, label: st.label || byId(st.up).name }));
    cutStairs(byId, stairs);
    for (const lv of lvls) for (const P of lv.patches) { P.l = []; P.props = []; P.teles = []; P.dn = []; P.wi = []; }

    /* then everything that stands on or against the floors */
    let ni = 0; const report = { doors: 0, named: 0, lost: [] };
    const pinned = new Set(); for (const l of real) for (const d of (l.doors || [])) if (d.name && !d.spare) pinned.add(d.name);
    const nameList = (names || []).filter(n => !pinned.has(n));
    for (const lv of lvls) {
        const l = lv.src, real2 = lv.patches.filter(P => !P.notch);
        const at = (x, y) => real2.find(P => x >= P.x0 && x < P.x1 && y >= P.y0 && y < P.y1);
        const wells = lv.patches.filter(P => P.notch);
        const onWall = (axis, a, line) => axis === "x" ? real2.find(P => P.y0 === line && a >= P.x0 && a < P.x1) || wells.find(P => P.y0 === line && a >= P.x0 && a < P.x1) : real2.find(P => P.x0 === line && a > P.y0 && a <= P.y1) || wells.find(P => P.x0 === line && a > P.y0 && a <= P.y1);
        const onLanding = (x, y) => wells.find(P => (P.sf || []).some(f => f.landing && x >= f.landing.x0 && x < f.landing.x1 && y >= f.landing.y0 && y < f.landing.y1));
        const ds = [...(l.doors || [])].sort((p, q) => (p.axis === "y" ? 0 : 1) - (q.axis === "y" ? 0 : 1) || p.at - q.at);
        for (const d of ds) {
            /* a door can straddle two lengths of wall: it goes with the one drawn last, or that one paints over it */
            const P = (d.axis === "x"
                ? real2.filter(q => q.y0 === d.line && q.x0 < d.at + 2 && q.x1 > d.at).sort((m, n) => n.x0 - m.x0)[0]
                : real2.filter(q => q.x0 === d.line && q.y0 < d.at && q.y1 > d.at - 2).sort((m, n) => n.y0 - m.y0)[0]) || onWall(d.axis, d.at, d.line);
            report.doors++;
            if (!P) { report.lost.push("door " + d.axis + d.at); continue; }
            const name = d.spare ? null : (d.name || nameList[ni++] || null);
            if (name) report.named++;
            P.dn.push({ d: [d.axis, d.at], name, sign: d.sign, kind: d.kind });
        }
        for (const q of (l.lamps || [])) { const P = onWall(q.axis, q.at, q.line); if (P) P.l.push([q.axis, q.at, q.colour, q.style, q.h]); else report.lost.push("lamp " + q.axis + q.at + " on " + l.id); }
        for (const q of (l.wallItems || [])) { const P = onWall(q.axis, q.at, q.line); if (P) P.wi.push(q); else report.lost.push((q.k || "wall item") + " " + q.axis + q.at + " on " + l.id); }
        for (const p of (l.props || [])) { const run = Parts.tiles(p), end = run[run.length - 1], P = onLanding(p.x, p.y) || (Parts.ROWS[p.k] && at(end[0], end[1])) || at(p.x, p.y); if (!P) report.lost.push(p.k + " at " + p.x + "," + p.y + " on " + l.id); const P2 = P || real2[0]; if (!P2) continue; const c = new Set(l.cells), against = !c.has(Math.floor(p.x / 2) + "," + Math.floor((p.y - 2) / 2)) || !c.has(Math.floor((p.x - 2) / 2) + "," + Math.floor(p.y / 2)); P2.props.push([p.k, p.x, p.y, !against, p.len, p.rot, p.style, p.colour, p.lights, p.lightUp, p.noCard, !!p.night, p.rare]); }

    }
    for (const q of (map.lifts || (map.lift ? [map.lift] : []))) {
        const li2 = byId(q.level); if (!li2) continue;
        const P = li2.patches.find(r => !r.notch && r.y0 === q.y && q.x >= r.x0 && q.x < r.x1);
        if (P) { (P.liftList = P.liftList || []).push(q.x); } else report.lost.push("lift " + q.x);
    }
    if (map.entrance) { const q = map.entrance, li3 = byId(q.level); if (li3) { (li3.portals = li3.portals || []).push(q); } }
    const li = null;
    if (li) { const P = li.patches.find(q => !q.notch && q.y0 === map.lift.y && map.lift.x >= q.x0 && map.lift.x < q.x1); if (P) P.lift = map.lift.x; else report.lost.push("lift"); }
    seq.report = report;
    return seq;
}

function build(cfg) {
    cfg = cfg || {};
    const names = cfg.names || H.names2();
    const levels = cfg.map ? fromMap(cfg.map, names) : plan();
    /* A to Z along the walking order */
    const QUOTA = cfg.map ? {} : { G: 16, F1: 12, F2: 7, F3: 4 };
    let ni = 0;
    for (const id of Object.keys(QUOTA)) {
        const lv = levels.find(l => l.id === id), q = QUOTA[id];
        const slots = [];
        for (const P of [...lv.patches].sort((a, c) => a.x0 - c.x0)) if (P.d) { P.dn = []; const ord = [...P.d].sort((a, c) => (a[0] === "y" ? 0 : 1) - (c[0] === "y" ? 0 : 1) || a[1] - c[1]); for (const dd of ord) { const it = { d: dd, name: null }; P.dn.push(it); slots.push(it); } }
        slots.forEach((it, i) => { if (Math.floor((i + 1) * q / slots.length) !== Math.floor(i * q / slots.length)) it.name = names[ni++] || null; });
    }
    w_total = ni;
    const MINX = -90, MAXX = 310, MINY = -130, MAXY = 120;
    const pw = (MAXX - MINX + MAXY - MINY) * 16 + 200, zSpan = 1100;
    const ox = (MAXY - MINY) * 16 - (MINX * 16) + 100 - (MAXY * 16 + 0) + 0;
    const oxx = 100 + (MAXY - MINX) * 16;
    const oyy = 100 - (MINX + MINY) * 8 + zSpan;
    const ph = (MAXX + MAXY - MINX - MINY) * 8 + 2 * zSpan + 300;
    const master = cfg.clip ? null : null;
    const cl = cfg.clip;                 // [cx, cy, w, h] in world px around at(); limits the work
    const at = (x, y, z) => [Math.round((x - y) * 16) + oxx, Math.round((x + y) * 8) + oyy - (z || 0)];
    const view = cl ? (() => { const c = at(cl[0], cl[1], cl[2]); return [c[0] - (cl[3] >> 1) - 40, c[1] - (cl[4] >> 1) - 40, c[0] + (cl[3] >> 1) + 40, c[1] + (cl[4] >> 1) + 40]; })() : [0, 0, pw, ph];
    const bw = view[2] - view[0], bh = view[3] - view[1];
    const out = new Buf(bw, bh, "000000"), layer = new Buf(bw, bh, "07060a");
    /* a door, or a bookcase hiding one: closed it's a still picture wider than the opening, the page draws it opening */
    const doorOrBook = (w, x, y, o, it) => { const fp = it && it.kind === "book" && FLOOR_PIECES.bookdoor; if (!fp) return H.door(w, x, y, o); const flip = !o.mapY, s = flip ? w.S(x - .5, y) : w.S(x, y - 2.5), im = wallArt(fp.f), a0 = Math.round(s[0]), a1 = Math.round(s[1]); for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; const sx = a0 - fp.ox + i, X = flip ? 2 * a0 - sx - 1 : sx, Y = a1 - fp.oy + j, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]; layer.set(X, Y, c); if (X >= 0 && Y >= 0 && X < bw && Y < bh) w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; } };
    /* a tint or see-through pixel of a new piece: remembered with what's under it now, and worked out after the colouring, on whatever colour the wall ends up. If something's gone over it by then, it's dropped */
    const pieceTint = (X, Y, c, A) => { if (X < 0 || Y < 0 || X >= bw || Y >= bh || furniX[Y * bw + X] !== NO_FURNI) return; const p = (Y * bw + X) * 4; w.tints.push([X, Y, c, A, (layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]]); };
    const furniX = new Int16Array(bw * bh), furniY = new Int16Array(bw * bh), furniC = new Int32Array(bw * bh), furniRun = new Uint8Array(bw * bh), NO_FURNI = -32768;
    const wallOwner = new Uint16Array(bw * bh), stairPx = new Uint8Array(bw * bh), railUnder = new Map();
    const mask = new Uint8Array(bw * bh), zb = new Int16Array(bw * bh), fc = new Int32Array(bw * bh), done = new Uint8Array(bw * bh);
    const gx = oxx - view[0], gy = oyy - view[1];
    const w = {
        keep: new Int32Array(bw * bh),
        glowing: new Int32Array(bw * bh),
        ox: gx, oy: gy, z: 0, b: layer, lamps: [], sprites: [], mats: [], tallX: TALLX, tallY: TALLY, seamX: SEAMX, seamY: SEAMY, wallTop: 101 + WALL_ADD, lampH: 106,
        S(x, y) { return [Math.round((x - y) * 16) + this.ox, Math.round((x + y) * 8) + this.oy - this.z]; },
        WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; },
        WY(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] - Math.floor(u / 2) - h]; }
    };
    const tileDraw = (X, Y, smp) => {
        const a = w.S(X, Y);
        for (let dy = 0; dy < 16; dy++) { const half = dy < 8 ? dy * 2 + 2 : (15 - dy) * 2 + 2; for (let dx = -half; dx <= half; dx++) { const c = smp(dx, dy); if (c) { const sx = a[0] + dx, sy = a[1] + dy; if (sx >= 0 && sy >= 0 && sx < bw && sy < bh) { layer.set(sx, sy, c); mask[sy * bw + sx] = 1; zb[sy * bw + sx] = w.z; fc[sy * bw + sx] = (c[0] << 16) | (c[1] << 8) | c[2]; } } } }
    };
    const inView = P => { const x0 = (P.x0 - P.y1) * 16 + gx - 200, x1 = (P.x1 - P.y0) * 16 + gx + 200, y0 = (P.x0 + P.y0) * 8 + gy - P.z - 200, y1 = (P.x1 + P.y1) * 8 + gy - P.z + 200; return !(x1 < 0 || x0 > bw || y1 < 0 || y0 > bh); };
    const xmasOn = /\+x$/.test(cfg.light || ""), way = cfg.way, Mname = String(cfg.light || "").replace("+x", "") || (cfg.map && cfg.map.light) || "sconces", M = LIGHTS[Mname] || LIGHTS.sconces, XMAS_K = new Set(["xmastree", "xmaslantern", "xmassmalltree", "xmasdrinks", "xmasduck", "snowman", "gift1", "gift2", "gift3", "gift4"]);
    w.lightsOff = !!M.off;
    let avL = [1, 1, 1];

    for (const lv of levels) {
        const has = new Set();
        for (const P of lv.patches) for (let X = P.x0; X < P.x1; X++) for (let Y = P.y0; Y < P.y1; Y++) has.add(X + "," + Y);
        const holes = new Set(); for (const r of (lv.holes || [])) for (let X = r.x0; X < r.x1; X++) for (let Y = r.y0; Y < r.y1; Y++) holes.add(X + "," + Y);
        if (!lv.patches.some(inView)) continue;
        /* Back walls only: where this floor's edge looks out over the floor below, that's a drop,
           not somewhere a wall belongs. */
        const belowCells = lv.below ? new Set(lv.below.src.cells) : null;
        const aboveLv = lv.src ? levels.find(q => q.src && q.src.k === lv.src.k + 1) : null, aboveCells = aboveLv ? new Set(aboveLv.src.cells) : null;
        /* ...unless there's a floor over it as well: then it's enclosed, and without a wall you'd see straight through */
        /* a door needs a wall to hang in: an edge with a door on it keeps its wall all along */
        const cellsHere = lv.src ? new Set(lv.src.cells) : null, floorAt = (X, Y) => cellsHere.has(Math.floor(X / 2) + "," + Math.floor(Y / 2));
        const doorEdge = (axis, X, Y) => {
            if (!cellsHere) return false;
            const ds = (lv.src.doors || []).filter(d => d.axis === axis && d.line === (axis === "x" ? Y : X));
            if (!ds.length) return false;
            if (axis === "x") { let a = X, b = X; while (floorAt(a - 1, Y) && !floorAt(a - 1, Y - 1)) a--; while (floorAt(b + 1, Y) && !floorAt(b + 1, Y - 1)) b++; return ds.some(d => d.at + 1 >= a && d.at <= b); }
            let a = Y, b = Y; while (floorAt(X, a - 1) && !floorAt(X - 1, a - 1)) a--; while (floorAt(X, b + 1) && !floorAt(X - 1, b + 1)) b++; return ds.some(d => d.at - 1 >= a && d.at - 2 <= b);
        };
        const airBelow = (X, Y) => !!belowCells && belowCells.has(Math.floor(X / 2) + "," + Math.floor(Y / 2)) && !(aboveCells && aboveCells.has(Math.floor(X / 2) + "," + Math.floor(Y / 2)));
        /* does the wall carry on along this line at this tile? Then the run before it has no end post. */
        const tileOf = new Map(); for (const Q of lv.patches) for (let X = Q.x0; X < Q.x1; X++) for (let Y = Q.y0; Y < Q.y1; Y++) tileOf.set(X + "," + Y, Q);
        const shownWalls = new Set((lv.src && lv.src.showWalls) || []), shown = (axis, line, t) => shownWalls.has(axis + "|" + line + "|" + t);
        const backWall = (X, Y, z) => { const Q = tileOf.get(X + "," + Y); return !!Q && (z === undefined || Q.z === z) && Q.y0 === Y && !has.has(X + "," + (Y - 1)) && !holes.has(X + "," + (Y - 1)) && !Q.noBack && (Q.notch || !airBelow(X, Y - 1) || doorEdge("x", X, Y) || shown("x", Y, X)); };
        const sideWall = (X, Y, z) => { const Q = tileOf.get(X + "," + Y); return !!Q && (z === undefined || Q.z === z) && Q.x0 === X && !has.has((X - 1) + "," + Y) && !holes.has((X - 1) + "," + Y) && (Q.notch || !airBelow(X - 1, Y) || doorEdge("y", X, Y) || shown("y", X, Y)); };
        layer.d.fill(0); for (let i = 0; i < layer.d.length; i += 4) { layer.d[i] = VOID[0]; layer.d[i + 1] = VOID[1]; layer.d[i + 2] = VOID[2]; layer.d[i + 3] = 255; }
        mask.fill(0); w.keep.fill(0); w.glowing.fill(0); w.footShadows = []; w.tints = []; w.sunWins = []; w.afterAll = []; w.treeGlows = [];
        w.lamps = [];
        wallOwner.fill(0);
        const signs = [], pushSign = signs.push.bind(signs); let signPatch = null;
        signs.push = o => pushSign({ ...o, wallZ: signPatch ? signPatch.z : w.z, wallLine: signPatch ? (o.alongY ? signPatch.x0 : signPatch.y0) : null });
        furniX.fill(NO_FURNI); stairPx.fill(0); railUnder.clear();
        const drawSprite = s => {
            if (!s.furni) return s.draw();
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set;
            const touched = [];
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { const i = y * bw + x; furniX[i] = s.tx; furniY[i] = s.ty; furniRun[i] = s.run || 0; touched.push(i); } };
            s.draw();
            if (own) layer.set = was; else delete layer.set;
            for (const i of touched) { const p = i * 4; furniC[i] = (layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]; }
        };
        /* A stairwell goes after everything behind it (to its left, or further back) and before everything in
           front of it (to its right, or nearer), wherever that falls among the floors' usual back-to-front order. */
        const drawList = lv.patches.filter(P => !P.notch).sort((a, c) => a.y0 - c.y0 || a.x0 - c.x0);
        for (const n of lv.patches.filter(P => P.notch).sort((a, c) => a.x0 - c.x0 || a.y0 - c.y0)) {
            const behind = Q => (Q.x1 <= n.x0 && Q.y0 < n.y1) || (Q.x0 < n.x1 && Q.x1 > n.x0 && Q.y1 <= n.y0);
            const inFront = Q => Q.x0 >= n.x1 || (Q.x0 < n.x1 && Q.x1 > n.x0 && Q.y0 >= n.y1);
            let at = 0; drawList.forEach((Q, i) => { if (behind(Q)) at = i + 1; });
            const before = drawList.slice(0, at), after = drawList.slice(at);
            drawList.length = 0; drawList.push(...before.filter(Q => !inFront(Q)), n, ...before.filter(inFront), ...after);
        }
        /* A wall with its own colours: every pixel of it is marked as it's drawn, and anything painted over it clears the mark. */
        const wallList = (lv.src && lv.src.walls) || [], wallWays = wallList.map(q => wayForWall(wayOf(cfg.single || lv.way) || WAYS.oxblood, q)), wallTag = wallList.length ? new Uint8Array(bw * bh) : null;
        const wallC = wallTag ? new Int32Array(bw * bh) : null;
        let curWall = 0;
        const colOf = (axis, line) => wallTag ? at => { const t = Math.floor((axis === "x" ? at : at - 1) / 16); curWall = 1 + wallList.findIndex(q => q.axis === axis && q.line === line && t >= q.a && t < q.b); } : null;
        const tagged = draw => {
            if (!wallTag) return draw();
            const was = layer.set;
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { wallTag[y * bw + x] = curWall; wallC[y * bw + x] = (c[0] << 16) | (c[1] << 8) | c[2]; } };
            draw();
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) wallTag[y * bw + x] = 0; };
        };
        /* Walls you've set to half height, tile by tile: the client's low panelled wall, standing on the floor. (halfWalls is the older
           form, by 2-tile section.) */
        const halfSet = new Set((lv.src && lv.src.halfTiles) || []);
        for (const k of ((lv.src && lv.src.halfWalls) || [])) { const [ax, ln, c] = k.split("|"); halfSet.add(ax + "|" + ln + "|" + (+c * 2)); halfSet.add(ax + "|" + ln + "|" + (+c * 2 + 1)); }
        const noneSet = new Set((lv.src && lv.src.noWalls) || []), portalTiles = new Set();
        for (const q of (lv.portals || [])) for (let t = 0; t < 8; t++) { const k = q.axis + "|" + q.line + "|" + (q.at + t); noneSet.add(k); portalTiles.add(k); }
        const halfOf = (axis, line) => {
            if (!halfSet.size && !noneSet.size) return {};
                        return axis === "x"
                ? { seamless: at => portalTiles.has("x|" + line + "|" + Math.floor(at / 16)), none: at => noneSet.has("x|" + line + "|" + Math.floor(at / 16)), half: at => halfSet.has("x|" + line + "|" + Math.floor(at / 16)), halfCol: (at, sx, fy) => halfWallColumn(layer, LOWX, lowX(at), sx, fy - HALF_WALL, HALF_WALL), halfEnd: Q => { for (let k = 0; k < 6; k++) halfWallColumn(layer, LOWX, 128 + k, Q[0] + k, Q[1] + Math.floor(k / 2) - HALF_WALL, HALF_WALL); }, halfStart: Q => lowWallStart(layer, LOWX, [0, 1, 2, 3].map(i => [i, Q[0] + i - 4]), 4, Q, HALF_WALL) }
                : { seamless: at => portalTiles.has("y|" + line + "|" + Math.floor((at - 1) / 16)), none: at => noneSet.has("y|" + line + "|" + Math.floor((at - 1) / 16)), half: at => halfSet.has("y|" + line + "|" + Math.floor((at - 1) / 16)), halfCol: (at, sx, fy) => halfWallColumn(layer, LOWY, lowY(at), sx, fy - HALF_WALL, HALF_WALL), halfEnd: Q => { for (let k = 0; k < 6; k++) halfWallColumn(layer, LOWY, k, Q[0] - 6 + k, Q[1] + Math.floor((6 - k) / 2) - HALF_WALL, HALF_WALL); }, halfStart: Q => lowWallStart(layer, LOWY, [130, 131, 132, 133].map((i, k) => [i, Q[0] + k]), 129, Q, HALF_WALL) };
        };
        /* note every pixel of a wall light as it's drawn, to put it back over the signs later */
        const lampPx = new Map();
        w.noRecess = !!cfg.map;
        const lampNoted = draw => {
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set;
            layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { const p = (y * bw + x) * 4; lampPx.set(y * bw + x, (layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]); } };
            draw();
            if (own) layer.set = was; else delete layer.set;
        };
        /* Parts of a floor at different heights overlap on screen, so they go strictly back to front, and whatever stands on the
           lower parts goes in among the raised parts, so a raised part in front covers it. A flat floor skips all this. */
        const lowest = Math.min(...lv.patches.map(q => q.z)), uneven = lv.patches.some(q => q.z !== lowest);
        /* see-through: while the editor's key is held, floor above this height isn't drawn, nor anything on it */
        const cut = cfg.cut && lv.src && cfg.cut.level === lv.src.id ? cfg.cut.z : null;
        const isBehind = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1) || (A.y1 <= B.y0 && A.x0 < B.x1);
        if (uneven) {
            const left = [...drawList]; drawList.length = 0;
            while (left.length) { let i = left.findIndex(A => !left.some(B => B !== A && isBehind(B, A))); if (i < 0) i = 0; drawList.push(left.splice(i, 1)[0]); }
        }
        const raisedLater = uneven ? drawList.filter(q => q.z > lowest) : [];
        for (const q of raisedLater) q.raised = true;
        {
            const behind = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1) || (A.y1 <= B.y0 && A.x0 < B.x1), left = [...raisedLater], sorted = [];
            while (left.length) { let i = left.findIndex(A => !left.some(B => B !== A && behind(B, A))); if (i < 0) i = 0; sorted.push(left.splice(i, 1)[0]); }
            raisedLater.length = 0; raisedLater.push(...sorted.filter(q => cut === null || q.z <= cut));
        }
        /* Small steps are part of the floor, so they take the light as the floor does. Left to the wall's light they stayed dark, and any step pixel the same colour as the floor
           under it was still counted as floor and lit up, which looked like the floor showing through. */
        const litAsFloor = (z, draw) => {
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set;
            layer.set = function (x, y, c) {
                was.call(layer, x, y, c);
                if (x < 0 || y < 0 || x >= bw || y >= bh) return;
                const i = y * bw + x, q = i * 4; if (Math.abs(layer.d[q] - c[0]) > 1 || Math.abs(layer.d[q + 1] - c[1]) > 1 || Math.abs(layer.d[q + 2] - c[2]) > 1) return;      // something in front kept this pixel
                mask[i] = 1; zb[i] = z; fc[i] = (layer.d[q] << 16) | (layer.d[q + 1] << 8) | layer.d[q + 2];
            };
            draw();
            if (own) layer.set = was; else delete layer.set;
        };
        /* small steps: a flight on the lower floor, climbing away from you */
        const zAt = (X, Y) => { const Q = tileOf.get(X + "," + Y); return Q ? Q.z : null; };
        for (const st of ((lv.src && lv.src.steps) || [])) {
            const alongY = st.axis === "y", back = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), near = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front";
            if (back === null || near === null) continue;
            const hi = toYou ? near : back, lo = toYou ? back : near;
            if (hi <= lo || (cut !== null && hi > cut)) continue;
            const diff = hi - lo, onR = (X, Y) => (lv.rugs || []).some(r => X >= r.x0 && X < r.x1 && Y >= r.y0 && Y < r.y1);
            let a0 = null, a1 = null; for (let t = st.a; t < st.b; t++) if (alongY ? onR(t, st.line) || onR(t, st.line - 1) : onR(st.line, t) || onR(st.line - 1, t)) { if (a0 === null) a0 = t; a1 = t + 1; }
            const count = Math.round(diff / STEP_R), reach = count * STEP_D, f = { axis: alongY ? "y" : "x", c0: st.a, c1: st.b, dTop: st.line, dStart: st.line - reach, steps: count, rise: STEP_R, tread: STEP_D, zB: lo, carpet: a0 === null ? null : [a0, a1], way: cfg.single || lv.way, tiled: true };
            const along = toYou ? Math.floor(st.line - reach) : st.line;
            const d0 = toYou ? Math.floor(st.line - reach) : st.line, d1 = toYou ? st.line : Math.ceil(st.line + reach);
            const onP = alongY ? tileOf.get(st.a + "," + d0) : tileOf.get(d0 + "," + st.a), whole = onP && (alongY ? onP.x0 <= st.a && onP.x1 >= st.b && onP.y0 <= d0 && onP.y1 >= d1 : onP.x0 <= d0 && onP.x1 >= d1 && onP.y0 <= st.a && onP.y1 >= st.b);
            /* only if it's all on that one part: a flight across two has to wait for both, or the second paints over it */
            (lv.later = lv.later || []).push({ withFloor: true, depth: along + st.a + .5, tx: alongY ? st.a : along, ty: alongY ? along : st.a, rect: alongY ? { x0: st.a, x1: st.b, y0: d0, y1: d1 } : { x0: d0, x1: d1, y0: st.a, y1: st.b }, draw: () => litAsFloor((hi + lo) / 2, () => toYou ? flightUpToYou(w, f) : flight(w, f)) });
        }
        /* A stair's rail is in front of everything but what stands between it and you: this floor's own parts and walls, on the line of sight */
        const seesRail = (x, y, z) => {
            let t = 0, px = Math.floor(x), py = Math.floor(y); const reach = (Z1 + 64) / 16;
            while (t < reach) {
                const tx = px + 1 - x, ty = py + 1 - y, nt = Math.min(tx, ty) + 1e-6, X = Math.floor(x + nt), Y = Math.floor(y + nt), zz = z + nt * 16, Q = tileOf.get(X + "," + Y);
                if (Q && !Q.notch) { if (zz <= Q.z) return false; if ((Y > py && backWall(X, Y) && zz <= Q.z + Z1 + 4) || (X > px && sideWall(X, Y) && zz <= Q.z + Z1 + 4)) return false; }      // a rail's pixels stand a little off the point tested
                t = nt; px = X; py = Y;
            }
            return true;
        };
        /* Following the line of sight towards you from a point: higher on it is nearer. Is there a floor at or above it on the way? */
        const highestFloor = uneven ? Math.max(...lv.patches.filter(q => !q.notch).map(q => q.z)) : 0;
        const coveredByFloor = (x, y, z) => {
            let t = 0, px = Math.floor(x), py = Math.floor(y); const Q0 = tileOf.get(px + "," + py); if (Q0 && !Q0.notch && z < Q0.z - .5) return true;
            while (z + t * 16 <= highestFloor) {
                const tx = px + 1 - x, ty = py + 1 - y, nt = Math.min(tx, ty) + 1e-6, X = Math.floor(x + nt), Y = Math.floor(y + nt), Q = tileOf.get(X + "," + Y);
                if (Q && !Q.notch && z + nt * 16 < Q.z - .5) return true;
                t = nt; px = X; py = Y; if (t > 40) break;
            }
            return false;
        };
        /* every drop, as a straight stretch of wall on the lower floor, drawn with what stands on the floors so the higher floor can't paint over it */
        if (uneven) {
            const T = w.wallTop, stepsOn = (axis, line, t) => ((lv.src && lv.src.steps) || []).some(st => st.axis !== axis && st.dir !== "front" && st.line === line && t >= st.a && t < st.b);
            const doorsOn = (lv.src && lv.src.doors) || [], noWall = new Set((lv.src && lv.src.noWalls) || []), lowWall = new Set((lv.src && lv.src.halfTiles) || []);
            const tiled = axis => { const out = new Map(); for (const [key, Q] of tileOf) { if (Q.notch) continue; const [X, Y] = key.split(",").map(Number), B = tileOf.get(axis === "x" ? X + "," + (Y - 1) : (X - 1) + "," + Y); if (!B || B.notch || B.z <= Q.z) continue; const line = axis === "x" ? Y : X, t = axis === "x" ? X : Y; if (stepsOn(axis, line, t)) continue; if (!out.has(line)) out.set(line, []); out.get(line).push({ t, z: Q.z, top: B.z }); } return out; };
            for (const axis of ["x", "y"]) for (const [line, list] of tiled(axis)) {
                list.sort((p, q) => p.t - q.t);
                for (let i = 0; i < list.length;) {
                    let j = i + 1; while (j < list.length && list[j].t === list[j - 1].t + 1 && list[j].z === list[i].z && list[j].top === list[i].top) j++;
                    const a = list[i].t, b = list[j - 1].t + 1, zr = list[i].z, drop = list[i].top - zr; i = j;
                    if (cut !== null && zr + drop > cut) continue;
                    const hasDoor = doorsOn.some(d => d.axis === axis && d.line === line && (axis === "x" ? d.at < b && d.at + 2 > a : d.at - 2 < b && d.at > a)), H = hasDoor ? Math.max(drop, DOOR_WALL) : drop;
                    const col = colOf(axis, line), capped = H > drop, state = t => { const k = axis + "|" + line + "|" + t; return noWall.has(k) ? "none" : lowWall.has(k) ? "half" : "full"; };
                    const onP = tileOf.get(axis === "x" ? a + "," + line : line + "," + a);
                    const liftBy = axis === "x" ? ((cfg.map && cfg.map.lifts) || []).filter(q => lv.src && q.level === lv.src.id && q.y === line && q.x < b + 1 && q.x + 4 > a).map(q => q.x + q.y - .4) : [];
                    (lv.later = lv.later || []).push({ withFloor: true, depth: Math.min((axis === "x" ? a + line : line + a) - .2, ...liftBy), tx: axis === "x" ? a : line, ty: axis === "x" ? line : a, draw: () => tagged(() => {
                        const zs = w.z; w.z = zr;
                        /* However the order comes out, a floor nearer on the line of sight covers this wall: a part of the same height diagonally in front of the one above it mustn't get its corner painted over */
                        const under = Object.prototype.hasOwnProperty.call(layer, "set") ? layer.set : null;
                        layer.set = function (x, y, c) {
                            const d = (x - gx) / 16, X = axis === "x" ? line + d : line, Y = axis === "x" ? line : line - d, z = (X + Y) * 8 + gy - y;
                            if (coveredByFloor(X, Y, z)) return;
                            if (under) under.call(layer, x, y, c); else Buf.prototype.set.call(layer, x, y, c);
                        };
                        for (let t = a; t < b; t++) {
                            const st = state(t); if (st === "none") continue;
                            for (let u = 0; u < 16; u++) {
                                const at = axis === "x" ? t * 16 + u : t * 16 + 1 + u; if (col) col(at);
                                const low = st === "half";
                                if (axis === "x") {
                                    const m = Math.floor(at / 128) * 8, i2 = ((at % 128) + 128) % 128, p = w.S(m, line), raw = at < a * 16 + 24;
                                    if (low) halfWallColumn(layer, LOWX, lowX(at), p[0] + i2, p[1] + Math.floor(i2 / 2) - H, H);
                                    else if (raw && capped) { const q = w.S(a, line), r = at - a * 16; shortWallColumn(layer, TALLX, r, T + Math.floor(r / 2), q[0] + r, q[1] + Math.floor(r / 2), H, capped); }
                                    else shortWallColumn(layer, SEAMX, i2, T + Math.floor(i2 / 2), p[0] + i2, p[1] + Math.floor(i2 / 2), H, capped);
                                } else {
                                    const m = Math.floor((at - 1) / 128) * 8, d = at - m * 16, i2 = 138 - d, p = w.S(line, m), raw = at <= a * 16 + 24;
                                    if (low) halfWallColumn(layer, LOWY, lowY(at), p[0] - 138 + i2, p[1] + Math.floor(d / 2) - H, H);
                                    else if (raw && capped) { const q = w.S(line, a), r = at - a * 16; shortWallColumn(layer, TALLY, 138 - r, T + Math.floor(r / 2), q[0] - r, q[1] + Math.floor(r / 2), H, capped); }
                                    else shortWallColumn(layer, SEAMY, i2, T + Math.floor(d / 2), p[0] - 138 + i2, p[1] + Math.floor(d / 2), H, capped);
                                }
                            }
                        }
                        /* its far end, finished like any wall's */
                        if (state(b - 1) !== "none" && (capped || state(b - 1) === "half")) {
                            if (col) col(axis === "x" ? b * 16 - 1 : b * 16);
                            const low = state(b - 1) === "half";
                            if (axis === "x") { const q = w.S(b, line); for (let k = 0; k < (low ? 6 : 10); k++) { if (low) halfWallColumn(layer, LOWX, 128 + k, q[0] + k, q[1] + Math.floor(k / 2) - H, H); else shortWallColumn(layer, TALLX, 128 + k, T + Math.floor((128 + k) / 2), q[0] + k, q[1] + Math.floor(k / 2), H, capped); } }
                            else { const q = w.S(line, b); for (let k = 0; k < (low ? 6 : 10); k++) { const span = low ? 6 : 10; if (low) halfWallColumn(layer, LOWY, k, q[0] - span + k, q[1] + Math.floor((span - k) / 2) - H, H); else shortWallColumn(layer, TALLY, k, T + Math.floor((138 - k) / 2), q[0] - span + k, q[1] + Math.floor((span - k) / 2), H, capped); } }
                        }
                        if (under) layer.set = under; else delete layer.set;
                        w.z = zs;
                    }) });
                }
            }
        }
        /* decorative floor edges: each run stands with the furniture, on the floor it belongs to, and climbs any small steps it's on */
        if (lv.src && lv.src.edgeItems) {
            const flightLift = (axis, across, along) => {
                for (const st of (lv.src.steps || [])) {
                    /* a run along y sits beside a flight climbing along y */
                    if (st.axis !== axis || across < st.a || across >= st.b) continue;
                    const alongY = st.axis === "y", back = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), near = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front";
                    if (back === null || near === null) continue;
                    const rise = toYou ? near - back : back - near; if (rise <= 0) continue;
                    const depth = rise / STEP_R * STEP_D, from = toYou ? st.line - depth : st.line, to = from + depth;
                    if (along >= from && along <= to) return rise * (toYou ? along - from : to - along) / depth;
                }
                return 0;
            };
            for (const run0 of EdgeItems.runsOf(lv.src.edgeItems)) {
                const onTile = t => run0.axis === "x" ? [t, run0.dir > 0 ? run0.line : run0.line - 1] : [run0.dir > 0 ? run0.line : run0.line - 1, t];
                /* a raised part draws in its own turn, so a run stops where a raised part does */
                const pieces = []; let a = null, prev = null;
                for (let t = run0.a; t <= run0.b; t++) {
                    const q = t < run0.b ? tileOf.get(onTile(t).join(",")) : null;
                    if (a !== null && (!q || (prev !== q && ((prev && prev.raised) || q.raised)))) { pieces.push({ ...run0, a, b: t }); a = null; }
                    if (a === null && q) a = t;
                    prev = q;
                }
                for (const run of pieces) {
                    const first = onTile(run.a), zBase = zAt(first[0], first[1]); if (zBase === null || (cut !== null && zBase > cut)) continue;
                    /* worked out once, the first time any tile of it is drawn */
                    let px = null;
                    const pixelsOf = () => {
                        if (px) return px;
                        const zs = w.z; w.z = zBase;
                        const at = (fx, fy) => w.S(fx, fy), lift = along => { const t = onTile(Math.floor(along)), z = zAt(t[0], t[1]); return (z === null ? 0 : z - zBase) + flightLift(run.axis === "x" ? "x" : "y", run.axis === "x" ? t[1] : t[0], along); };
                        px = new Map(); for (const q of EdgeItems.pixels(run, at, lift)) { if (!px.has(q[3])) px.set(q[3], []); px.get(q[3]).push(q); }
                        w.z = zs; return px;
                    };
                    /* each tile of it takes its own place among the furniture: a back edge goes behind what stands on that tile, a front edge in front of it */
                    for (let t = run.a; t < run.b; t++) {
                        const tile = onTile(t);
                        const owner = tileOf.get(tile.join(","));
                        (lv.later = lv.later || []).push({ depth: tile[0] + tile[1] + (run.dir > 0 ? -.1 : .6), tx: tile[0], ty: tile[1], furni: true, rect: { x0: tile[0], x1: tile[0] + 1, y0: tile[1], y1: tile[1] + 1 }, foot: run.axis === "x" ? { x0: tile[0], x1: tile[0] + 1, y0: tile[1] + (run.dir > 0 ? 0 : 1), y1: tile[1] + (run.dir > 0 ? 0 : 1) } : { x0: tile[0] + (run.dir > 0 ? 0 : 1), x1: tile[0] + (run.dir > 0 ? 0 : 1), y0: tile[1], y1: tile[1] + 1 }, draw: () => {
                            for (const [X, Y, c] of (pixelsOf().get(t) || [])) {
                                layer.set(X, Y, c);
                                if (w.keep && X >= 0 && Y >= 0 && X < bw && Y < bh) w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1;
                            }
                        } });
                    }
                }
            }
        }
        /* what stands on a part of the floor goes into the queue. A raised part's goes in before anything is drawn, so the queue can be put in order with all of it there. */
        const queueScenery = P => {
            const zn = w.z, inReach = (x, y, m) => { const sx = (x - y) * 16 + gx, sy = (x + y) * 8 + gy - zn; return sx > -m && sx < bw + m && sy > -m && sy < bh + m; };
            /* scenery */
            w.partAt = q => { const zq = zAt(q.x, q.y); if (cut !== null && zq !== null && zq > cut) return false; w.z = zq === null ? P.z : zq; return true; };
            const here = w.sprites;
            /* how much taller a tall pillar must be for its top to meet the underside of the floor above: that floor's height over this tile, less its 12px edge and the pillar's own 94px */
            const tallBy = (X, Y, z) => { const c = Math.floor(X / 2) + "," + Math.floor(Y / 2), up = ((lv.src ? lv.src.k : 0) + 1) * Z1 + ((aboveLv && aboveLv.src.rise && aboveLv.src.rise[c]) || 0); return Math.max(0, up - 12 - z - 94); };
            /* on a landing: at the landing's height, and drawn here, seen only through the stairwell's opening like the rest of it */
            const landingOf = P.notch ? (P.sf || []).find(f => f.landing) : null, landZ = landingOf ? landingOf.landing.z : null, landingQueue = [];
            if (landingOf) w.partAt = () => { if (cut !== null && landZ > cut) return false; w.z = landZ; return true; };
            for (const p of (P.props || [])) {
                const [k, x, y] = p;
                if (!inReach(x, y, 340)) continue;
                if (landingOf) w.z = landZ;
                w.sprites = landingOf ? landingQueue : (lv.later = lv.later || []);      // one queue for every part of a floor, or a raised part's things paint over what stands on the part next to it      // all in one queue, or what stands against a wall gets painted over by what is behind it
                const from = w.sprites.length; let partsNow = null;
                if (k === "lamp") floorLamp(w, x, y, p[6], p[7]);
                else if (k === "trophy") {
                    const row = Parts.parts({ k, x, y, rot: p[5] }), far = row[0], turned = !!(p[5] & 1), near = row[row.length - 1];
                    if (w.partAt(far)) { const fp = FLOOR_PIECES[k], base = w.S(x, y), im = wallArt(fp.f), X0 = Math.round(base[0]), Y0 = Math.round(base[1]);
                        w.sprites.push({ depth: near.x + near.y + .5, ftx: near.x, fty: near.y, draw: () => { for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4, A = im.rgba[q + 3]; if (!A) continue; const X = turned ? X0 - fp.ox + i : X0 + fp.ox - i, Y = Y0 - fp.oy + j, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]; if (A < 255) { pieceTint(X, Y, c, A); continue; } layer.set(X, Y, c); if (X >= 0 && Y >= 0 && X < bw && Y < bh) w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; } } }); }
                }
                else if (FLOOR_PIECES[k]) {
                    if (k === "xmastree" && xmasOn) w.treeGlows.push(w.S(x + .25, y + .25));
                    if (!(XMAS_K.has(k) && !xmasOn) && w.partAt({ x, y })) { const fp = FLOOR_PIECES[k], flat = k.startsWith("mark_"), base = w.S(x + (flat ? .5 : .25), y + (flat ? .5 : .25)), im = wallArt(k === "rarecase" && p[12] && fp.opts && fp.opts[p[12]] ? fp.opts[p[12]].f : fp.f), z = w.z, X0 = Math.round(base[0]) - fp.ox, Y0 = Math.round(base[1]) - fp.oy;
                        w.sprites.push({ depth: x + y + (flat ? -.6 : .5), ftx: x, fty: y, draw: () => { for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4, A = im.rgba[q + 3]; if (!A) continue; const X = k === "rarecase" && (p[5] & 1) ? Math.round(base[0]) + fp.ox - i : X0 + i, Y = Y0 + j, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]]; if (A < 255) { pieceTint(X, Y, c, A); continue; } layer.set(X, Y, c); if (X >= 0 && Y >= 0 && X < bw && Y < bh) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; w.keep[Y * bw + X] = v; if (k === "rarecase" && c[0] === 186 && c[1] === 206 && c[2] === 220) w.glowing[Y * bw + X] = v; } } } }); }
                }
                else if (k === "rope") {
                    /* each tile of it takes its own place in the queue, so what stands nearer on another tile still covers it */
                    const row = Parts.parts({ k, x, y, len: p[4], rot: p[5] }), art = RopeBarrier.pixels({ x, y, len: row.length, rot: p[5], noCard: p[10], part: p[11] ? "poles" : undefined }, (fx, fy) => { w.partAt({ x: Math.floor(fx), y: Math.floor(fy) }); return w.S(fx, fy); });
                    row.forEach((q, t) => {
                        if (!w.partAt(q)) return;
                        const foot = art.feet.find(f => f[2] === t), z = w.z, mine = art.list.filter(a => a[3] === t);
                        w.sprites.push({ depth: q.x + q.y + .5, ftx: q.x, fty: q.y, draw: () => {
                            if (foot && w.footShadows) w.footShadows.push([foot[0], foot[1], z]);
                            for (const [X, Y, c] of mine) { layer.set(X, Y, c); if (w.keep && X >= 0 && Y >= 0 && X < bw && Y < bh) w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; }
                        } });
                    });
                }
                else for (const q of partsNow = Parts.parts({ k, x, y, len: p[4], rot: p[5] })) w.partAt(q) && H.furni(w, q.names, q.x, q.y, { flip: q.flip, dz: k === "statue" || k === "fountain" ? 1.5 : 0, stretch: k === "pillartall" ? tallBy(q.x, q.y, w.z) : 0, keepColour: k === "pillar" || k === "pillartall" || k === "ero" || k.startsWith("ero_") || k === "smtable" || k === "ballpost" || k === "shelf" || k === "sofa" || k === "table" || k === "chair", tint: k === "ballpost" || ((k === "pillar" || k === "pillartall") && (wayOf(cfg.single || lv.way) || {}).planks) ? floorTint(cfg.single || lv.way) : (k === "sofa" || k === "chair") && (lv.k !== 0 || (lv.src && lv.src.colour)) ? cushionTint(cfg.single || lv.way) : null });
                if ((k === "pillar" || k === "pillartall") && p[8]) for (const f of p[8]) pillarLight(w, x, y, f, p[7], p[9]);
                w.z = P.z;
                for (let i = from; i < w.sprites.length; i++) { const q = w.sprites[i]; q.tx = q.ftx === undefined ? x : q.ftx; q.ty = q.fty === undefined ? y : q.fty; q.furni = true; q.run = partsNow && partsNow.length > 1 ? (partsNow[1].x !== partsNow[0].x ? 1 : 2) : 0; if (k === "statue" || k === "fountain") q.foot = { x0: x - 1, x1: x + 2, y0: y - 1, y1: y + 2 }; }      // Ground's sofas and chairs keep their original red
            }
            w.sprites = here;
            return landingQueue;
        };
        /* How a wall ends where it meets another round a corner. On one height it just runs into it. Between heights they still make a corner: the lower wall runs into the higher, and only the part of the higher wall that stands above the lower keeps its end. */
        const cornerEnd = (carriesOn, meets, otherZ, z) => { if (carriesOn) return { noEnd: true }; if (!meets || otherZ === null) return { noEnd: false }; return z > otherZ ? { noEnd: false, endKeep: z - otherZ + 14 } : { noEnd: true }; };
        const drawPatch = P => {
            signPatch = P; w.z = P.z; w.sprites = []; w.mats = [];
            if (P.notch && P.upLv) {
                /* A stairwell is only ever seen through its opening. Each pixel of it is tested against
                   the floor above: if that floor is in the way, the pixel was never visible. */
                const up = P.upLv;
                if (!up.tileSet) { up.tileSet = new Set(); for (const q of up.patches) if (!q.notch) for (let X = q.x0; X < q.x1; X++) for (let Y = q.y0; Y < q.y1; Y++) up.tileSet.add(X + "," + Y); }
                const raw = Buf.prototype.set, zUp = P.z + Z1;
                layer.set = function (x, y, c) {
                    const rx = x - gx, ry = y - gy + zUp;
                    if (up.tileSet.has(Math.floor((rx + 2 * ry) / 32) + "," + Math.floor((2 * ry - rx) / 32))) return;
                    raw.call(layer, x, y, c);
                };
            } else if (P.raised) {
                const raw = Buf.prototype.set, patches = lv.patches;
                layer.set = function (x, y, c) {
                    if (x >= 0 && y >= 0 && x < bw && y < bh) { const o = wallOwner[y * bw + x]; if (o) { const Q = patches[o - 1]; if (!Q.raised && !Q.notch && (P.x1 <= Q.x0 && P.y0 < Q.y1 || P.y1 <= Q.y0 && P.x0 < Q.x1)) return; } }
                    raw.call(layer, x, y, c);
                };
            } else delete layer.set;
            /* note a lower part's walls as they go on */
            const beforeWalls = Object.prototype.hasOwnProperty.call(layer, "set") ? layer.set : null, ownerId = lv.patches.indexOf(P) + 1;
            if (ownerId) { const was = layer.set; layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { wallOwner[y * bw + x] = ownerId; stairPx[y * bw + x] = 0; } }; }
            /* walls wherever nothing lies behind */
            let run = null;
            for (let X = P.x0; X <= P.x1; X++) { const open = X < P.x1 && !has.has(X + "," + (P.y0 - 1)) && !holes.has(X + "," + (P.y0 - 1)) && !P.noBack && (P.notch || !airBelow(X, P.y0 - 1) || doorEdge("x", X, P.y0) || shown("x", P.y0, X)); if (open && run === null) run = X; if (!open && run !== null) { tagged(() => H.wallRunX(w, run, X, P.y0, { ...cornerEnd(backWall(X, P.y0, P.z), sideWall(X, P.y0 - 1), zAt(X, P.y0 - 1), P.z), noStart: backWall(run - 1, P.y0, P.z), col: colOf("x", P.y0), ...halfOf("x", P.y0) })); run = null; } }
            run = null;
            for (let Y = P.y0; Y <= P.y1; Y++) { const open = Y < P.y1 && !has.has((P.x0 - 1) + "," + Y) && !holes.has((P.x0 - 1) + "," + Y) && (P.notch || !airBelow(P.x0 - 1, Y) || doorEdge("y", P.x0, Y) || shown("y", P.x0, Y)); if (open && run === null) run = Y; if (!open && run !== null) { tagged(() => H.wallRunY(w, P.x0, run, Y, { ...cornerEnd(sideWall(P.x0, Y, P.z), backWall(P.x0 - 1, Y), zAt(P.x0 - 1, Y), P.z), noStart: sideWall(P.x0, run - 1, P.z), col: colOf("y", P.x0), ...halfOf("y", P.x0) })); run = null; } }
            for (const q of (lv.portals || [])) { if (tileOf.get(q.axis === "x" ? q.at + "," + q.line : q.line + "," + q.at) === P) { drawPortal(w, q.axis, q.line, q.at, "alcove"); drawPortal(w, q.axis, q.line, q.at, "arch"); } }
            /* A wall running alongside small steps climbs with them, panelling, paper and cap together, so it flows from the lower floor's wall into the higher one's instead of jumping.
               Each column of it moves up by how far the steps have climbed there; the steps, drawn after, cover what's left at its foot. */
            for (const st of ((lv.src && lv.src.steps) || [])) {
                const alongY = st.axis === "y"; if (st.a !== (alongY ? P.x0 : P.y0)) continue;
                const backZ = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), nearZ = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front"; if (backZ === null || nearZ === null) continue;
                const hi = toYou ? nearZ : backZ, lo = toYou ? backZ : nearZ; if (hi <= lo || P.z !== lo || (cut !== null && hi > cut)) continue;
                const reach = Math.round((hi - lo) / STEP_R) * STEP_D, from = toYou ? st.line - reach : st.line, rate = STEP_R / STEP_D, d0 = alongY ? P.y0 : P.x0, d1 = alongY ? P.y1 : P.x1;
                for (let k = 0; k <= Math.ceil(reach * 16); k++) {
                    const d = from + k / 16; if (d < d0 || d >= d1) continue;
                    const lift = Math.round(toYou ? (d - from) * rate : (hi - lo) - (d - from) * rate); if (lift <= 0) continue;
                    const sx = Math.round((alongY ? st.a - d : d - st.a) * 16) + gx, foot = Math.round((d + st.a) * 8) + gy - lo; if (sx < 0 || sx >= bw) continue;
                    for (let y = Math.max(lift, foot - Z1 - 20); y <= Math.min(bh - 1, foot + 2); y++) {
                        const i = y * bw + sx; if (wallOwner[i] !== ownerId) continue;
                        const j = (y - lift) * bw + sx;
                        layer.d[j * 4] = layer.d[i * 4]; layer.d[j * 4 + 1] = layer.d[i * 4 + 1]; layer.d[j * 4 + 2] = layer.d[i * 4 + 2];
                        wallOwner[j] = ownerId; if (wallTag) { wallTag[j] = wallTag[i]; wallC[j] = wallC[i]; }
                    }
                }
            }
            if (ownerId) { if (beforeWalls && !wallTag) layer.set = beforeWalls; else if (!wallTag) delete layer.set; else { const wrapped = layer.set; layer.set = beforeWalls || Buf.prototype.set; void wrapped; } }
            /* doors, sconces */
            const zn = w.z;
            const inReach = (x, y, m) => { const sx = (x - y) * 16 + gx, sy = (x + y) * 8 + gy - zn; return sx > -m && sx < bw + m && sy > -m && sy < bh + m; };
            if (P.blank) { for (let X = Math.ceil(P.x0 / 16) * 16 + 4; X < P.x1 - 4; X += 16) { if (inReach(X, P.y0, 340)) { H.door(w, X, P.y0, {}); lampNoted(() => H.lamp(w, X + 6, P.y0, { dead: X % 48 !== 4 })); } } }
            for (const it of (P.dn || [])) {
                const [axis, at2] = it.d;
                if (!(axis === "x" ? inReach(at2, P.y0, 340) : inReach(P.x0, at2, 340))) continue;
                const hover = !!it.name && cfg.hover === it.name, open = !!it.name && cfg.open === it.name;
                /* A door in a retaining wall: drawn after that wall, with what stands on the floor, so the higher floor behind doesn't paint over it. */
                const behindZ = axis === "x" ? zAt(at2, P.y0 - 1) : zAt(P.x0 - 1, at2 - 1);
                if (behindZ !== null && cut !== null && behindZ > cut) continue;
                if (behindZ !== null && behindZ > P.z) {
                    const a = axis === "x" ? at2 : at2 - 2, zHere = P.z, tileLine = axis === "x" ? P.y0 : P.x0;
                    (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: (axis === "x" ? at2 + P.y0 : P.x0 + at2) + .3, tx: axis === "x" ? a : tileLine, ty: axis === "x" ? tileLine : a, draw: () => {
                        const zs = w.z; w.z = zHere;
                        if (axis === "x") doorOrBook(w, at2, tileLine, { hover, open }, it);
                        else doorOrBook(w, tileLine, at2, { mapY: true, hover, open }, it);
                        w.z = zs;
                    } });
                    if (it.name) { if (axis === "x") signs.push({ s: w.WX(at2 + 1, P.y0, 0, 71), name: it.name, hover, sign: { v: 7, ...it.sign } }); else signs.push({ s: w.WY(P.x0, at2 - 1, 0, 71), name: it.name, alongY: true, hover, sign: { v: 7, ...it.sign } }); }
                    continue;
                }
                if (axis === "x") { doorOrBook(w, at2, P.y0, { hover, open }, it); if (it.name) { const s = w.WX(at2 + 1, P.y0, 0, 71); signs.push({ s, name: it.name, hover, sign: { v: 7, ...it.sign } }); } }
                else { doorOrBook(w, P.x0, at2, { mapY: true, hover, open }, it); if (it.name) { const s = w.WY(P.x0, at2 - 1, 0, 71); signs.push({ s, name: it.name, alongY: true, hover, sign: { v: 7, ...it.sign } }); } }
            }
            for (const it of (P.wi || [])) {
                const def = WALL_ITEM.get(it.k); if (!def) continue;
                if (def.xmas && !xmasOn) continue;
                if (it.k === "i_window") { const zw = P.z, wide = it.w || 52, b0 = it.b || 0, top0 = it.top || 78, flip = it.axis === "x", one = () => { const zs = w.z; w.z = zw; const start = it.at - wide / 32, s0 = flip ? w.S(start, it.line) : w.S(it.line, start); w.z = zs; const a0 = Math.round(s0[0]), a1 = Math.round(s0[1]) - 6, view = wallArt("i_view_" + (xmasOn && cfg.light ? "snow_" : "") + (Mname === "day" ? "day" : Mname === "night" || Mname === "failing" ? "night" : Mname === "dawn" ? "dawn" : "dusk") + ".png"), place = HallWindow.PLACES[it.view] || HallWindow.PLACES.lawn, H2 = top0 - b0, offx = place[0] - wide / 2, offy = place[1] - H2 / 2, Y0 = a1 + wide / 2 - top0;
                        /* looking out: the picture stays upright, only its outline follows the wall */
                        for (let u = 0; u < wide; u++) { for (let v = 0; v < H2; v++) { const sxm = a0 - wide + u, sy = Y0 - Math.floor(u / 2) + v, X = flip ? 2 * a0 - sxm - 1 : sxm, sxv = Math.max(0, Math.min(view.w - 1, Math.round(u + offx))), syv = Math.max(0, Math.min(view.h - 1, Math.round(sy - Y0 + offy))), q = (syv * view.w + sxv) * 4; let c = [view.rgba[q], view.rgba[q + 1], view.rgba[q + 2]]; c = c.map((n, k) => n * .88 + [200, 225, 240][k] * .12); const slant = u - (H2 - v) * .34; for (const [o, sw] of [[.2, 7], [.34, 3], [.72, 5]]) { const x0 = wide * o; if (slant >= x0 && slant < x0 + sw) { c = c.map(n => n * .8 + 255 * .2); break; } } c = c.map(n => Math.round(Math.min(255, n))); layer.set(X, sy, c); if (X >= 0 && sy >= 0 && X < bw && sy < bh) { const n = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; w.keep[sy * bw + X] = n; w.glowing[sy * bw + X] = n; } } }
                        const fr = HallWindow.art(wide, b0, top0); for (let j = 0; j < fr.h; j++) for (let i = 0; i < fr.w; i++) { const q = (j * fr.w + i) * 4; if (fr.rgba[q + 3] < 128) continue; const sx = a0 - fr.ox + i, X = flip ? 2 * a0 - sx - 1 : sx, Y = a1 - fr.oy + j, c = [fr.rgba[q], fr.rgba[q + 1], fr.rgba[q + 2]]; layer.set(X, Y, c); if (X >= 0 && Y >= 0 && X < bw && Y < bh) { w.keep[Y * bw + X] = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; if (w.glowing[Y * bw + X]) w.glowing[Y * bw + X] = 0; } }
                        if (Mname === "day") w.sunWins.push({ a0, a1, W: wide, b: b0, top: top0, flip, z: zw, line: it.line, start }); };
                    const behind0 = it.axis === "x" ? zAt(Math.floor(it.at), P.y0 - 1) : zAt(P.x0 - 1, Math.floor(it.at - 1)), onDrop0 = behind0 !== null && behind0 > P.z; if (onDrop0) continue; if (it.axis === "x" ? inReach(it.at, P.y0, 340) : inReach(P.x0, it.at, 340)) w.afterAll.push({ zHere: P.z, depth: (it.axis === "x" ? it.at + P.y0 : P.x0 + it.at) + .35, tx: it.axis === "x" ? Math.floor(it.at) : P.x0, ty: it.axis === "x" ? P.y0 : Math.floor(it.at), draw: one }); continue; }
                if (!(it.axis === "x" ? inReach(it.at, P.y0, 340) : inReach(P.x0, it.at, 340))) continue;
                const behind = it.axis === "x" ? zAt(Math.floor(it.at), P.y0 - 1) : zAt(P.x0 - 1, Math.floor(it.at - 1)), onDrop = behind !== null && behind > P.z;
                if (onDrop && cut !== null && behind > cut) continue;
                const zHere = P.z, one = () => {
                    const zs = w.z; w.z = zHere;
                    const base = it.axis === "x" ? w.S(it.at, it.line) : w.S(it.line, it.at), base0 = base, cx = Math.round(base[0]), cy = Math.round(base[1] - (def.locked || it.h === undefined ? (def.h || 100) : it.h));
                    w.z = zs;
                    const litNow = !!def.lit && !M.off;
                    if (it.k === "i_garland" && def.spots) { const BAUB = { red: ["c8352a", "ff8a78", "7a1b16"], gold: ["d6ad56", "fff4c8", "86601f"], blue: ["3a7ad6", "a8d0ff", "1f4a90"], silver: ["c9cdd4", "ffffff", "7a808a"], purple: ["8a3ac8", "d0a0ff", "4e1f7a"], pink: ["e0568c", "ffb0cc", "8a2450"], teal: ["2aa8a0", "a0f0e8", "146a64"] }, hx = s => [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)], chosen = ((cfg.map && cfg.map.baubles) || Object.keys(BAUB)).filter(n => BAUB[n]), use = chosen.length ? chosen : Object.keys(BAUB), lay = (it.axis === "x" ? def.x : def.y).layers[0], ROW = ["..c..", ".KKK.", "KHGGK", "KGGGK", "KGGDK", ".KKK."], iw = wallArt(lay.f).w; (() => def.spots.forEach((q, n) => { const B = BAUB[use[n % use.length]], X = cx + lay.x + (lay.flip ? iw - 1 - q[0] : q[0]) - 2, Y = cy + lay.y + q[1]; ROW.forEach((r, j) => { for (let u = 0; u < 5; u++) { const ch = r[u]; if (ch === ".") continue; layer.set(X + u, Y + j, ch === "K" ? [0, 0, 0] : ch === "c" ? hx("d6ad56") : ch === "H" ? hx(B[1]) : ch === "D" ? hx(B[2]) : hx(B[0])); } }); }))(); }
                    for (const l of (it.axis === "x" ? def.x : def.y).layers) {
                        const im = wallArt(litNow && l.litF ? l.litF : l.f);
                        for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
                            const q = (j * im.w + i) * 4, A = im.rgba[q + 3]; if (def.tell ? !A : A < 128) continue;
                            const X = cx + l.x + (l.flip ? im.w - 1 - i : i), Y = cy + l.y + j, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]];
                            if (def.tell && A < 255) { pieceTint(X, Y, c, A); continue; }
                            layer.set(X, Y, c);
                            if (X >= 0 && Y >= 0 && X < bw && Y < bh) { const v = ((c[0] << 16) | (c[1] << 8) | c[2]) + 1; w.keep[Y * bw + X] = v; if (litNow && glowsAfterDark(c)) w.glowing[Y * bw + X] = v; }
                        }
                    }
                    if (litNow) { const g = def.lit.at, flip = it.axis === "x", gu = flip ? -(g[0] - g[1]) : g[0] - g[1], gv = (g[0] + g[1]) / 2 - g[2]; w.lamps.push({ x: Math.round(base0[0] + gu), y: Math.round(base0[1] + gv), tx: it.axis === "x" ? it.at : P.x0, ty: it.axis === "x" ? P.y0 : it.at, i: w.lamps.length, colour: def.lit.colour, axisY: it.axis !== "x", lz: zHere, sign: true }); }
                };
                if (def.tell) w.afterAll.push({ zHere: P.z, depth: (it.axis === "x" ? it.at + P.y0 : P.x0 + it.at) + .35, tx: it.axis === "x" ? Math.floor(it.at) : P.x0, ty: it.axis === "x" ? P.y0 : Math.floor(it.at), draw: one, axis: it.axis, line: it.axis === "x" ? P.y0 : P.x0, out: def.out || 0 }); else if (onDrop) (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: (it.axis === "x" ? it.at + P.y0 : P.x0 + it.at) + .35, tx: it.axis === "x" ? Math.floor(it.at) : P.x0, ty: it.axis === "x" ? P.y0 : Math.floor(it.at), draw: one }); else one();
            }
            for (const [axis, at2, lc, style, lampHigh] of (P.l || [])) {
                if (!(axis === "x" ? inReach(at2, P.y0, 340) : inReach(P.x0, at2, 340))) continue;
                const behind = axis === "x" ? zAt(Math.floor(at2), P.y0 - 1) : zAt(P.x0 - 1, Math.floor(at2 - 1)), onDrop = behind !== null && behind > P.z;
                if (onDrop && cut !== null && behind > cut) continue;
                const zHere = P.z, tileX = axis === "x" ? at2 : P.x0, tileY = axis === "x" ? P.y0 : at2;
                const dead = !lc && !M.off && Mname === "failing" && !M.lamp(lampKey(tileX, tileY));
                const one = () => {
                    const usualH = w.lampH, zs = w.z; w.z = zHere; if (lampHigh !== undefined) w.lampH = lampHigh;
                    if (style === "globe") {
                        const h0 = w.lampH === undefined ? 66 : w.lampH, at = (u, h) => axis === "x" ? w.WX(at2, P.y0, u, h0 + h) : w.WY(P.x0, at2, u, h0 + h);
                        lampNoted(() => smallGlobe(w, at, axis === "x" ? -1 : 1, { colour: lc, dead }));
                        const q = at(0, 4); w.lamps.push({ x: q[0], y: q[1], tx: tileX, ty: tileY, i: w.lamps.length, colour: lc, axisY: axis !== "x", dead });
                    } else if (axis === "x") lampNoted(() => H.lamp(w, at2, P.y0, { colour: lc, dead }));
                    else { lampNoted(() => H.lamp(w, P.x0, at2, { mapY: true, colour: lc, dead })); w.lamps[w.lamps.length - 1].axisY = true; }
                    w.lamps[w.lamps.length - 1].lz = zHere;
                    w.lampH = usualH; w.z = zs;
                };
                if (onDrop) (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: tileX + tileY + .35, tx: Math.floor(tileX), ty: Math.floor(tileY), draw: one }); else one();
            }
            for (const l of w.lamps) if (l.lz === undefined) l.lz = w.z;
            /* floor */
            const zf = w.z;
            for (let Y = P.y0; Y < P.y1; Y++) for (let X = P.x0; X < P.x1; X++) {
                const fsx = (X - Y) * 16 + gx, fsy = (X + Y) * 8 + gy - zf;
                if (fsx < -34 || fsx > bw + 34 || fsy < -18 || fsy > bh + 2) continue;
                let smp;
                const plainS = (wayOf(cfg.single || lv.way) || {}).planks ? (dx, dy) => plankAt(X, Y, dx, dy) : (dx, dy) => modPx(plain, false, 2 + m4(X), 2 + m4(Y), dx, dy);
                const med = (P.medal && [{ x: P.medal[0], y: P.medal[1] }] || lv.medals || []).find(m => X >= m.x && X < m.x + 4 && Y >= m.y && Y < m.y + 4);
                if (med) { const ma = X - med.x, mb = Y - med.y; smp = (dx, dy) => modPx(crossPc, false, 2 + ma, 2 + mb, dx, dy); }
                else if (lv.rugs && lv.rugs.length) { const XX = X, YY = Y, F = lv.rugF || (lv.rugF = rugField(lv.rugs)); smp = (dx, dy) => rugFieldAt(F, XX, YY, dx, dy) || plainS(dx, dy); }
                else smp = plainS;
                tileDraw(X, Y, smp);
            }
            /* slab edges */
            const pal = ["000000", "af6947", "925030", "925030", "7d4122", "7d4122", "712f16", "000000", "5a1a06", "450e00", "450e00", "000000"].map(hex);
            const yEdge = [], xEdge = [];
            if (!P.notch) for (let X = P.x0; X < P.x1; X++) if (!has.has(X + "," + P.y1) && !holes.has(X + "," + P.y1)) yEdge.push(X);
            if (!P.notch) for (let Y = P.y0; Y < P.y1; Y++) if (!has.has(P.x1 + "," + Y) && !holes.has(P.x1 + "," + Y)) xEdge.push(Y);
            const near = (x, y) => { const q = w.S(x, y); return q[0] > -40 && q[0] < bw + 40 && q[1] > -40 && q[1] < bh + 40; };
            for (const X of yEdge) if (near(X, P.y1) || near(X + 1, P.y1)) for (let u = 0; u <= (has.has((X + 1) + "," + P.y1) ? 15 : 16); u++) pal.forEach((c, d) => { const Q = w.WX(X, P.y1, u, -1 - d); layer.set(Q[0], Q[1], c); });
            for (const Y of xEdge) if (near(P.x1, Y) || near(P.x1, Y + 1)) for (let u = 0; u <= (has.has(P.x1 + "," + (Y - 1)) ? 15 : 16); u++) pal.forEach((c, d) => { const Q = w.WY(P.x1, Y + 1, u, -1 - d); layer.set(Q[0], Q[1], c); });
            if (P.bridge) {
                /* the deep beam and pillars under the bridge */
                for (let u = 0; u <= (P.y1 - P.y0) * 16; u++) for (let d = 13; d < 26; d++) { const Q = w.WY(P.x1, P.y1, u, -d); layer.set(Q[0], Q[1], d === 25 ? C.k : (u >> 1) % 6 === 0 ? C.d1 : C.d2); }
            }
            /* half-level steps */
            for (const st of (P.steps || [])) flightX(w, st[1], st[2], st[3], st[4], st[5], { side: false, band: [1e6, 1e6 + 1] });
            /* the embedded stairs */
            if (P.notch && P.upLv) {
                const zs = w.z; w.z = P.z + Z1;
                for (let X = P.x0; X < P.x1; X++) if (P.upLv.tileSet.has(X + "," + (P.y0 - 1))) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WX(X, P.y0, u, -1 - d); layer.set(Q[0], Q[1], c); });
                for (let Y = P.y0; Y < P.y1; Y++) if (P.upLv.tileSet.has((P.x0 - 1) + "," + Y)) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WY(P.x0, Y + 1, u, -1 - d); layer.set(Q[0], Q[1], c); });
                w.z = zs;
            }
            for (const f of (P.sf || [])) {
                const was = layer.set, own = Object.prototype.hasOwnProperty.call(layer, "set");
                layer.set = function (x, y, c) { was.call(layer, x, y, c); if (x >= 0 && y >= 0 && x < bw && y < bh) { const p = (y * bw + x) * 4; if (layer.d[p] === c[0] && layer.d[p + 1] === c[1] && layer.d[p + 2] === c[2]) stairPx[y * bw + x] = 1; } };
                const mine = () => { if (own) layer.set = was; else delete layer.set; };
                if (!f.landing) {
                    flight(w, f);
                    mine();
                    continue;
                }
                const L = f.landing, zs = w.z; w.z = L.z;
                for (let Y = L.y0; Y < L.y1; Y++) for (let X = L.x0; X < L.x1; X++) { const XX = X, YY = Y; tileDraw(XX, YY, (dx, dy) => (L.rug && rugFieldAt(L.rug, XX, YY, dx, dy)) || ((wayOf(cfg.single || lv.way) || {}).planks ? plankAt(XX, YY, dx, dy) : modPx(plain, false, 2 + m4(XX), 2 + m4(YY), dx, dy))); }
                /* under its open edge, the wall carries on down to the floor */
                { const H0 = L.z - P.z; if (L.edgeX) { for (let at = L.x0 * 16; at < L.x1 * 16; at++) { const sx = at - L.y1 * 16 + w.ox, base = Math.round((at / 16 + L.y1) * 8) + w.oy - P.z; for (let h = 0; h < H0; h++) { const c = stairWallPx(w, false, L.y1, sx, base - h, h, P.z); if (c) layer.set(sx, base - h, c); } } } else for (let at = L.y0 * 16 + 1; at <= L.y1 * 16; at++) { const sx = L.x1 * 16 - at + w.ox, base = Math.round((L.x1 + at / 16) * 8) + w.oy - P.z; for (let h = 0; h < H0; h++) { const c = stairWallPx(w, true, L.x1, sx, base - h, h, P.z); if (c) layer.set(sx, base - h, c); } } }
                /* its edge, on the side you can see */
                if (L.edgeX) { for (let X = L.x0; X < L.x1; X++) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WX(X, L.y1, u, -1 - d); layer.set(Q[0], Q[1], c); }); }
                else for (let Y = L.y0; Y < L.y1; Y++) for (let u = 0; u <= 16; u++) pal.forEach((c, d) => { const Q = w.WY(L.x1, Y + 1, u, -1 - d); layer.set(Q[0], Q[1], c); });
                w.z = zs; mine();
            }
            for (const fl of (P.fl || [])) flightY(w, fl[1], fl[2], fl[3], fl[4], fl[5]);
            if (P.lift !== undefined) lift(w, P.lift, P.y0, { open: cfg.liftOpen });
            for (const lx of (P.liftList || [])) { const zl = P.z, ly = P.y0; (P.raised ? w.sprites : (lv.later = lv.later || [])).push({ depth: lx + ly - .3, tx: lx, ty: ly, draw: () => { const zs = w.z; w.z = zl; lift(w, lx, ly, { open: cfg.liftOpen }); w.z = zs; } }); }
            /* main flights */
            for (const fl of (P.flights || [])) { flightY(w, fl[1], fl[2], fl[3], fl[4], fl[5]); if (fl[6]) signs.push({ s: w.WY(fl[2], fl[3] + 3.5, 0, 22), name: fl[6], alongY: true }); }
            if (P.side) {
                /* a side-on flight along the wall: climbs -x, then a landing into the floor above */
                const s = P.side, xs = s.x + s.w;
                /* the landing on a solid base */
                const zT = Z1;
                const zsave = w.z;
                for (let u = 0; u < s.w * 16; u++) for (let h = 0; h <= zT; h++) { const Q = w.WX(s.x, s.y + s.w, u, h); let c = (u >> 1) % 6 === 0 ? C.d2 : C.d3; if (h === 0 || h >= zT - 12) c = h === zT ? C.k : C.d5; layer.set(Q[0], Q[1], c); }
                w.z = zT;
                for (let Y = s.y; Y < s.y + s.w; Y++) for (let X = s.x; X < s.x + s.w; X++) tileDraw(X, Y, (dx, dy) => modPx(plain, false, 2 + m4(X), 2 + m4(Y), dx, dy));
                w.z = zsave;
                flightX(w, s.y, s.y + s.w, xs, 14, 0);
            }
            const landingQueue = P.queued ? [] : queueScenery(P);
            if (landingQueue.length) { const zs = w.z; landingQueue.sort((a, c) => a.depth - c.depth).forEach(drawSprite); w.z = zs; }
            if (P.tele && !cfg.noTele) teleport(w, "doorD", P.tele[0], P.tele[1], {});
            for (const t of (P.teles || [])) teleport(w, "doorD", t.x, t.y, { flip: !!t.flip });
            if (cfg.avatarS && cfg.avatar && cfg.avatar.lv === lv.id && cfg.avatar.p === lv.patches.indexOf(P)) { const a = cfg.avatar; w.sprites.push({ depth: a.x + a.y + .5, draw: () => { const im = avatarFile("s", a.dir, a.action || "std", a.frame || 0), Q = w.S(a.x, a.y); layer.blit(im, Q[0] - 16, Q[1] + 8 - (im.h - 6)); } }); }
            if (w.recess) { w.sprites.push(...w.recess); w.recess = []; }
            if (P.rails) w.sprites.push(...P.rails);
            w.sprites.sort((a, c) => a.depth - c.depth).forEach(drawSprite);
        };
        /* the top of a handrail coming up the stairs stands above this floor, so it's in this floor's picture */
        for (const q of levels) if (q !== lv) for (const P of q.patches) if (P.notch && P.upLv === lv) for (const f of (P.sf || [])) {
            if (!f.axis || f.tiled) continue; const zUp = P.z + Z1;
            (lv.later = lv.later || []).push({ furni: true, afterFloors: true, depth: f.c0 + f.dTop + 1, tx: f.axis === "y" ? f.c0 : Math.floor(f.dTop), ty: f.axis === "y" ? Math.floor(f.dTop) : f.c0, rect: f.axis === "y" ? { x0: f.c0, x1: f.c1, y0: Math.floor(f.dTop), y1: Math.floor(f.dTop) + 2 } : { x0: Math.floor(f.dTop), x1: Math.floor(f.dTop) + 2, y0: f.c0, y1: f.c1 }, draw: () => flightRails(w, railsFor(f, q.patches), (x, y, col, c, d, z) => { if (z > zUp && seesRail(c, d, z)) layer.set(x, y, col); }) });
        }
        /* The stair rails go in the one queue before anything is drawn: a stairwell can be drawn from that queue itself, and what's added to it by then is never reached */
        for (const P of drawList) if (P.notch && P.upLv && (!P.raised || raisedLater.includes(P))) {
            const up = P.upLv; if (!up.tileSet) { up.tileSet = new Set(); for (const q of up.patches) if (!q.notch) for (let X = q.x0; X < q.x1; X++) for (let Y = q.y0; Y < q.y1; Y++) up.tileSet.add(X + "," + Y); }
            const landings = (P.sf || []).filter(f => f.landing).map(f => f.landing);
            for (const f of (P.sf || [])) if (!f.landing && f.axis && !f.tiled) (lv.later = lv.later || []).push({ furni: true, afterFloors: !!f.run, depth: (f.axis === "y" ? f.c0 + f.dTop : f.dTop + f.c0) + 40, tx: f.axis === "y" ? f.c0 : Math.floor(f.dTop), ty: f.axis === "y" ? Math.floor(f.dTop) : f.c0, railsOf: P, draw: () => { const zUp = P.z + Z1; flightRails(w, railsFor(f, lv.patches), (x, y, col, c, d, z) => {
                if (z > zUp) return; const t = (zUp - z) / 16; if (P.upLv.tileSet.has(Math.floor(c + t) + "," + Math.floor(d + t))) return; if (!seesRail(c, d, z)) return;
                /* what stands on the landing and nearer than this bit of rail stays in front of it */
                if (x >= 0 && y >= 0 && x < bw && y < bh) { const i = y * bw + x, fx = furniX[i]; if (fx !== NO_FURNI) { const fy = furniY[i]; if (landings.some(L => fx >= L.x0 && fx < L.x1 && fy >= L.y0 && fy < L.y1) && fx + fy + 2 > c + d) return; } }
                if (x >= 0 && y >= 0 && x < bw && y < bh) { const i = y * bw + x; if (!railUnder.has(i) && furniX[i] === NO_FURNI && !stairPx[i]) { const p = i * 4; railUnder.set(i, [layer.d[p], layer.d[p + 1], layer.d[p + 2]]); } }
                layer.set(x, y, col);
            }); } });
        }
        /* a landing's things are drawn with the landing, as part of it, so only the other parts' go in the queue */
        for (const P of raisedLater) { if (P.notch && (P.sf || []).some(f => f.landing)) continue; w.z = P.z; w.sprites = []; queueScenery(P); P.queued = true; }
        for (const P of drawList) if (!P.raised) drawPatch(P);
        delete layer.set;
        const later = lv.later ? lv.later.sort((a, c) => a.depth - c.depth || (a.ty || 0) - (c.ty || 0)) : [];
        w.z = lowest;
        /* The raised parts of the floor and everything standing on the floor, put in one order. A thing goes after the part it stands on and before any part or thing that's nearer;
           where that says nothing, the nearer tile goes last. Things are judged by the ground they cover, with a tile's grace, because the art of a long planter spills over its neighbour's tile. */
        {
            const footOf = q => q.foot || q.rect || (q.tx === undefined ? null : { x0: q.tx, x1: q.tx + 1, y0: q.ty, y1: q.ty + 1 });
            const nodes = [...raisedLater.map(P => ({ P, key: P.x0 + P.y0 - .5, foot: P, wait: 0, then: [], done: false })), ...later.map(q => ({ q, key: q.tx === undefined ? 1e9 : q.depth, foot: footOf(q), wait: 0, then: [], done: false }))];
            const before = (A, B) => { A.then.push(B); B.wait++; if (A.P && B.q) B.onFloors = (B.onFloors || 0) + 1; };
            /* small steps and short walls belong to the part they stand on: they go down straight after it */
            for (const n of nodes) if (n.q && n.q.withFloor) { const own = tileOf.get(Math.floor(n.q.tx) + "," + Math.floor(n.q.ty)); if (own && own.raised) n.key = own.x0 + own.y0 - .49; else n.q.withFloor = false; }
            const G = .99, sees = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1 + G && B.y0 < A.y1 + G) || (A.y1 <= B.y0 && A.x0 < B.x1 + G && B.x0 < A.x1 + G);
            const patchBehind = (A, B) => (A.x1 <= B.x0 && A.y0 < B.y1) || (A.y1 <= B.y0 && A.x0 < B.x1);
            for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) {
                if (i === j) continue; const A = nodes[i], B = nodes[j];
                if (A.P && B.P) { if (i < j) before(A, B); continue; }      // the parts keep the order already worked out for them
                if (A.P && B.q) { if (B.q.afterFloors) { before(A, B); continue; } const R = B.q.rect || B.foot; if (R && R.x0 < A.P.x1 && R.x1 > A.P.x0 && R.y0 < A.P.y1 && R.y1 > A.P.y0) before(A, B); continue; }
                if (A.q && B.P) { if (A.q.afterFloors) continue; const R = A.q.rect || A.foot; if (R && !(R.x0 < B.P.x1 && R.x1 > B.P.x0 && R.y0 < B.P.y1 && R.y1 > B.P.y0) && patchBehind(R, B.P) && !A.q.withFloor) before(A, B); continue; }
                if (A.foot && B.foot && sees(A.foot, B.foot) && !sees(B.foot, A.foot)) before(A, B);
            }
            for (let left = nodes.length; left > 0; left--) {
                let pick = null, stuck = null;
                for (const n of nodes) { if (n.done) continue; if (n.q && !n.onFloors && (!stuck || n.key < stuck.key)) stuck = n;      /* when things can only be ordered by breaking a rule, break it for a thing whose floor is down, never for the floors themselves */ if (n.wait <= 0 && (!pick || n.key < pick.key)) pick = n; }
                pick = pick || stuck || nodes.find(n => n.P && !n.done) || nodes.find(n => !n.done); pick.done = true; for (const n of pick.then) { n.wait--; if (pick.P && n.q) n.onFloors--; }
                w.z = lowest;
                if (pick.P) { drawPatch(pick.P); delete layer.set; } else drawSprite(pick.q);
            }
            later.length = 0;
        }
        w.z = lowest; later.forEach(drawSprite);
        const paintedAfter = new Set(); w.afterAll.sort((a, c) => a.depth - c.depth).forEach(s => {
            const own = Object.prototype.hasOwnProperty.call(layer, "set"), was = layer.set, mine = new Set();
            layer.set = function (x, y, c) { if (x >= 0 && y >= 0 && x < bw && y < bh) { const i = y * bw + x; if ((furniX[i] !== NO_FURNI && !mine.has(i) && (!s.axis || (s.axis === "y" ? furniX[i] >= s.line + s.out : furniY[i] >= s.line + s.out))) || (mask[i] === 1 && zb[i] > s.zHere)) return; mine.add(i); paintedAfter.add(i); was.call(layer, x, y, c); furniX[i] = s.tx; furniY[i] = s.ty; furniRun[i] = 0; const p = i * 4; furniC[i] = (layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]; } };
            w.z = s.zHere; s.draw();
            if (own) layer.set = was; else delete layer.set;
        });
        /* a wall light stays in front of a window or poster hung where it is */
        for (const i of paintedAfter) { const c = lampPx.get(i); if (c === undefined) continue; const q = i * 4; layer.d[q] = c >> 16; layer.d[q + 1] = (c >> 8) & 255; layer.d[q + 2] = c & 255; } w.z = lowest;
        /* A wall with a floor above it, whose edge lies right along the wall's top, goes straight up under that floor with no cap of its own, however low its own floor is:
           from the bottom of the upper floor's edge down to where the plain wallpaper starts, the wallpaper's own repeat, taken from further down the same column. */
        /* what has been painted over since is not furniture or a lamp any more, or it would keep old wall from being tidied below */
        for (let i = 0; i < furniX.length; i++) if (furniX[i] !== NO_FURNI) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== furniC[i]) furniX[i] = NO_FURNI; }
        for (const [i, c] of lampPx) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== c) lampPx.delete(i); }
        if (aboveLv && !lv.closed) {
            const upSet = new Set(); for (const q of aboveLv.patches) if (!q.notch) for (let X = q.x0; X < q.x1; X++) for (let Y = q.y0; Y < q.y1; Y++) upSet.add(X + "," + Y);
            const upBase = aboveLv.src.k * Z1, upRise = (X, Y) => (aboveLv.src.rise && aboveLv.src.rise[Math.floor(X / 2) + "," + Math.floor(Y / 2)]) || 0, REPEAT = 18, EDGE_ROWS = 13, CAP_ROWS = 24, WALL_REPEAT = 64, WOOD_ROWS = 46;
            const fill = (sx, y0, y1, yMax, dir, wallAtTile, line, floorZ) => {
                if (sx < 0 || sx >= bw) return;
                const plain = (X, Y) => { const n = Y * bw + X; return !stairPx[n] && (furniX[n] === NO_FURNI || railUnder.has(n)) && !lampPx.has(n); };
                /* the next repeat down has the same wallpaper, as long as it's still wallpaper and not the wood or the floor below it */
                const down = (X, Y, last) => { if (X < 0 || X >= bw) return -1; while (Y >= 0 && Y < bh && Y <= last) { if (plain(X, Y)) return Y * bw + X; Y += REPEAT; } return -1; };
                for (let y = Math.max(0, y0); y <= y1 && y < bh; y++) {
                    let yy = y; while (yy <= y1) yy += REPEAT;
                    const i = y * bw + sx; if (furniX[i] !== NO_FURNI || lampPx.has(i) || stairPx[i]) continue;
                    let j = down(sx, yy, yMax);
                    for (let n = 1; j < 0 && n <= 4; n++) for (const s of [1, -1]) { if (j >= 0 || !wallAtTile(s * n * 4)) continue; const X2 = sx + s * dir * n * WALL_REPEAT; if (X2 < 0 || X2 >= bw) continue; j = down(X2, yy + s * n * WALL_REPEAT / 2, yMax + s * n * WALL_REPEAT / 2); }
                    if (j < 0) { const art = stairWallPx(w, dir < 0, line, sx, y, yMax + WOOD_ROWS - y, floorZ); if (art) { const b2 = i * 4; layer.d[b2] = art[0]; layer.d[b2 + 1] = art[1]; layer.d[b2 + 2] = art[2]; } continue; }
                    const a = j * 4, b2 = i * 4, under = railUnder.get(j), from = under || [layer.d[a], layer.d[a + 1], layer.d[a + 2]]; if (from[0] === VOID[0] && from[1] === VOID[1] && from[2] === VOID[2]) continue;
                    layer.d[b2] = from[0]; layer.d[b2 + 1] = from[1]; layer.d[b2 + 2] = from[2];
                    if (wallTag) { wallTag[i] = wallTag[j]; wallC[i] = wallC[j]; }
                }
            };
            for (const [key, Q] of tileOf) {
                const [X, Y] = key.split(",").map(Number), f = Q.z;
                if (backWall(X, Y) && !noneSet.has("x|" + Y + "|" + X) && !halfSet.has("x|" + Y + "|" + X) && (upSet.has(X + "," + (Y - 1)) || upSet.has(X + "," + Y))) {
                    const zUp = upBase + upRise(X, upSet.has(X + "," + (Y - 1)) ? Y - 1 : Y);
                    for (let u = 0; u < 16; u++) { const sx = (X - Y) * 16 + u + gx, base8 = Math.round((X + u / 16 + Y) * 8) + gy; fill(sx, base8 - zUp + EDGE_ROWS, base8 - (f + Z1) + CAP_ROWS - 1, base8 - f - WOOD_ROWS, 1, n => backWall(X + n, Y), Y, f); }
                }
                if (sideWall(X, Y) && !noneSet.has("y|" + X + "|" + Y) && !halfSet.has("y|" + X + "|" + Y) && (upSet.has((X - 1) + "," + Y) || upSet.has(X + "," + Y))) {
                    const zUp = upBase + upRise(upSet.has((X - 1) + "," + Y) ? X - 1 : X, Y);
                    for (let u = 0; u < 16; u++) { const sx = (X - Y) * 16 - u + gx, base8 = Math.round((X + Y + u / 16) * 8) + gy; fill(sx, base8 - zUp + EDGE_ROWS, base8 - (f + Z1) + CAP_ROWS - 1, base8 - f - WOOD_ROWS, -1, n => sideWall(X, Y + n), X, f); }
                }
            }
        }
        for (let i = 0; i < furniX.length; i++) if (furniX[i] !== NO_FURNI) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== furniC[i]) furniX[i] = NO_FURNI; }
        /* Where small steps run out to an open edge of the floor, the moulding slopes down the flight like a staircase's closed string,
           over the steps' ends, and what's under it is left empty so the wall below shows through. All along that edge the wall below
           loses its own cap, so the moulding reads the same from end to end. Done last, or the lower parts' edges paint back over it; railings and furniture stay on top. */
        {
            const voidPx = i => { const p = i * 4; layer.d[p] = VOID[0]; layer.d[p + 1] = VOID[1]; layer.d[p + 2] = VOID[2]; };
            const inB = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh, open = (X, Y) => !has.has(X + "," + Y) && !holes.has(X + "," + Y);
            const capDone = new Set(), base = lv.src ? lv.src.k * Z1 : 0;
            /* follow the line of sight up towards you from a point: higher on it is nearer, so a floor or a wall of this floor met on the way is in front of that point */
            const inFront = (x, y, z) => {
                /* tile by tile along the ray, so it costs next to nothing */
                let t = 0, px = Math.floor(x), py = Math.floor(y); const reachT = (Z1 + 64) / 16;
                while (t < reachT) {
                    const tx = px + 1 - x, ty = py + 1 - y, nt = Math.min(tx, ty) + 1e-6, X = Math.floor(x + nt), Y = Math.floor(y + nt), zz = z + nt * 16, Q = tileOf.get(X + "," + Y);
                    if (Q && !Q.notch) { if (zz <= Q.z) return true; const tallAt = (axis, line, t2) => { const k = axis + "|" + line + "|" + t2; return noneSet.has(k) ? 0 : halfSet.has(k) ? HALF_WALL : Z1; }; if ((Y > py && backWall(X, Y) && zz <= Q.z + tallAt("x", Y, X)) || (X > px && sideWall(X, Y) && zz <= Q.z + tallAt("y", X, Y))) return true; }
                    t = nt; px = X; py = Y;
                }
                return false;
            };
            for (const st of ((lv.src && lv.src.steps) || [])) {
                const alongY = st.axis === "y", back = alongY ? zAt(st.a, st.line - 1) : zAt(st.line - 1, st.a), nearer = alongY ? zAt(st.a, st.line) : zAt(st.line, st.a), toYou = st.dir === "front";
                if (back === null || nearer === null) continue;
                const hi = toYou ? nearer : back, lo = toYou ? back : nearer;
                if (hi <= lo || (cut !== null && hi > cut)) continue;
                const reach = Math.round((hi - lo) / STEP_R) * STEP_D, from = toYou ? st.line - reach : st.line, to = toYou ? st.line : st.line + reach, C2 = st.b;
                const pt = d => alongY ? [C2, d] : [d, C2], tileBeyond = d => alongY ? [C2, d] : [d, C2], tileOn = d => alongY ? [C2 - 1, d] : [d, C2 - 1];
                let clear = true; for (let d = Math.floor(from); d < Math.ceil(to); d++) { const q = tileBeyond(d); if (!open(q[0], q[1])) clear = false; }
                if (!clear) continue;
                const rate = STEP_R / STEP_D, LIP = 6;
                /* height along the edge, distance down the flight from its top */
                const zDown = t => t < reach ? Math.min(hi, hi + LIP - t * rate) : Math.max(lo, lo + LIP - (t - reach) * rate);
                const t1 = reach + LIP / rate;
                for (let k = -3; k <= Math.ceil(t1 * 16); k++) {
                    const t = k / 16, d = toYou ? to - t : from + t, [X, Y] = pt(d), sx = Math.round((X - Y) * 16) + gx, rowAt = z => Math.round((X + Y) * 8) + gy - z;
                    const top = rowAt(Math.round(zDown(t))) + 1, bottom = rowAt(lo) + FLOOR_EDGE.length;
                    if (lv.below) { const y0 = rowAt(base) + 13; (lv.below.noCap = lv.below.noCap || []).push([sx, y0, y0 + WALL_CAP - 3]); }
                    for (let y = top; y <= bottom; y++) {
                        if (!inB(sx, y)) continue; const i = y * bw + sx; if (furniX[i] !== NO_FURNI || inFront(X, Y, rowAt(0) - y) || (alongY ? inFront(X, Y + .06, rowAt(0) - y) || inFront(X, Y - .06, rowAt(0) - y) : inFront(X + .06, Y, rowAt(0) - y) || inFront(X - .06, Y, rowAt(0) - y))) continue;
                        if (y - top < FLOOR_EDGE.length) { const c = FLOOR_EDGE[y - top], p = i * 4; layer.d[p] = c[0]; layer.d[p + 1] = c[1]; layer.d[p + 2] = c[2]; } else voidPx(i);
                    }
                }
                /* the wall below loses its cap along this whole edge */
                if (!lv.below) continue;
                const edgeTile = t => { const a = tileOn(t), b = tileBeyond(t); return has.has(a[0] + "," + a[1]) && open(b[0], b[1]); };
                const list = (lv.below.noCap = lv.below.noCap || []);
                const walk = (t0, dir) => { for (let t = t0; edgeTile(t); t += dir) {
                    const key = (alongY ? "y" : "x") + C2 + "|" + t; if (capDone.has(key)) continue; capDone.add(key);
                    const a = tileOn(t); if (zAt(a[0], a[1]) !== base) continue;
                    for (let u = 0; u < 16; u++) { const [X, Y] = pt(t + u / 16), sx = Math.round((X - Y) * 16) + gx, y0 = Math.round((X + Y) * 8) + gy - base + 13; list.push([sx, y0, y0 + WALL_CAP - 3]); }
                } };
                walk(Math.floor(from), -1); walk(Math.floor(from) + 1, 1);
            }
        }
        /* Along the open edge of a floor, where the floor changes height the moulding doesn't stop dead: from the higher floor's edge it slopes down over the start of the lower one and runs into its edge, as it does beside small steps. */
        if (uneven) {
            const inB = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh, gone = (X, Y) => !has.has(X + "," + Y) && !holes.has(X + "," + Y);
            const stepsThere = (axis, line, at) => ((lv.src && lv.src.steps) || []).some(st => st.axis === axis && st.b === line && Math.abs(at - st.line) <= 8);
            const inSight = (x, y, z) => { let t = 0, px = Math.floor(x), py = Math.floor(y); while (t < 8) { const tx = px + 1 - x, ty = py + 1 - y, nt = Math.min(tx, ty) + 1e-6, X = Math.floor(x + nt), Y = Math.floor(y + nt), Q = tileOf.get(X + "," + Y); if (Q && !Q.notch && z + nt * 16 < Q.z) return false; t = nt; px = X; py = Y; } return true; };
            /* one edge, one junction: along +1 on screen from the junction into the lower floor, or -1 */
            const wedge = (axis, line, at, dir, lo, hi) => {
                const drop = hi - lo, L = Math.min(48, Math.max(24, drop * 3));      // a big drop is steep, or the slope hides tiles you can walk on
                for (let n = 0; n < L; n++) {
                    /* n pixels along from the junction: u is the screen column from the point (at, line) */
                    const u = dir > 0 ? n : -1 - n, along = axis === "x" ? (u + .5) / 16 : -(u + .5) / 16;
                    const X = axis === "x" ? at + along : line, Y = axis === "x" ? line : at + along;
                    const tileX = axis === "x" ? Math.floor(X) : line - 1, tileY = axis === "x" ? line - 1 : Math.floor(Y), Q = tileOf.get(tileX + "," + tileY);
                    if (!Q || Q.notch || Q.z !== lo || !gone(axis === "x" ? tileX : line, axis === "x" ? line : tileY)) break;
                    const sx = (axis === "x" ? (at - line) : (line - at)) * 16 + u + gx, base = ((axis === "x" ? at + line : line + at) * 8) + gy - lo + (axis === "x" ? Math.floor(u / 2) : -Math.ceil(u / 2));
                    const top = base + 1 - Math.round(drop * (1 - (n + .5) / L));
                    for (let d = 0, y = top; y <= base + FLOOR_EDGE.length; d++, y++) {
                        if (!inB(sx, y)) continue; const i = y * bw + sx; if (furniX[i] !== NO_FURNI || !inSight(X, Y, (X + Y) * 8 + gy - y)) continue;
                        const under = y - base - 1, c = d < 8 ? FLOOR_EDGE[d] : FLOOR_EDGE[under >= 8 ? under : 9], q = i * 4;   /* the moulding on top, then the plain dark of its underside down to the lower floor's own edge */ layer.d[q] = c[0]; layer.d[q + 1] = c[1]; layer.d[q + 2] = c[2];
                    }
                }
            };
            for (const [key, Q] of tileOf) {
                if (Q.notch) continue;
                const [X, Y] = key.split(",").map(Number);
                if (gone(X, Y + 1)) { const N = tileOf.get((X + 1) + "," + Y); if (N && !N.notch && N.z !== Q.z && gone(X + 1, Y + 1) && !stepsThere("x", Y + 1, X + 1)) { if (cut === null || Math.max(N.z, Q.z) <= cut) { if (N.z < Q.z) wedge("x", Y + 1, X + 1, 1, N.z, Q.z); else wedge("x", Y + 1, X + 1, -1, Q.z, N.z); } } }
                if (gone(X + 1, Y)) { const N = tileOf.get(X + "," + (Y + 1)); if (N && !N.notch && N.z !== Q.z && gone(X + 1, Y + 1) && !stepsThere("y", X + 1, Y + 1)) { if (cut === null || Math.max(N.z, Q.z) <= cut) { if (N.z < Q.z) wedge("y", X + 1, Y + 1, -1, N.z, Q.z); else wedge("y", X + 1, Y + 1, 1, Q.z, N.z); } } }
            }
        }
        /* anything painted over a floor pixel since is not floor any more */
        for (let i = 0; i < mask.length; i++) if (mask[i]) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== fc[i]) mask[i] = 0; }
        const stairPlaques = [];
        for (const ss of (lv.stairSigns || [])) { const zs = w.z; w.z = ss.z; const q = w.WX(ss.x, ss.y, 0, 0); stairPlaques.push({ s: q, z: ss.z, line: ss.y, name: ss.name, sign: ss.sign || {} }); w.z = zs; }
        if (wallTag) for (let i = 0; i < wallTag.length; i++) if (wallTag[i]) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== wallC[i]) wallTag[i] = 0; }
        /* colour, then light from each lamp, then the signs */
        const colour = cfg.single || lv.way;
        /* only what's still showing: furniture or a nearer wall may have gone over it since */
        for (const [i, c] of lampPx) { const p = i * 4; if (((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) !== c) lampPx.delete(i); }
        const tintsLeft = w.tints.filter(t => { const p = (t[1] * bw + t[0]) * 4; return ((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) === t[4] || furniX[t[1] * bw + t[0]] === NO_FURNI; });
        recolour(layer, colour, [0, 0, bw, bh], w.keep, wallTag ? { tag: wallTag, ways: wallWays } : null);
        for (const [X, Y, c, A] of tintsLeft) { const p = (Y * bw + X) * 4; if (A === 200) { for (let k = 0; k < 3; k++) layer.d[p + k] = Math.min(255, layer.d[p + k] * c[k] / 128); } else { const m = (A - 1) / 100; for (let k = 0; k < 3; k++) layer.d[p + k] = layer.d[p + k] * (1 - m) + c[k] * m; } }
        /* a lamp's foot shadow, on the floor only: after the colouring, since a darkened pixel isn't one of the floor's colours any more */
        for (const [sx, sy, sz] of w.footShadows) for (let j = -5; j <= 6; j++) for (let i = -11; i <= 11; i++) {
            const e = (i * i) / 110 + ((j - 1) * (j - 1)) / 27; if (e > 1) continue;
            const X = sx + i + 1, Y = sy + j; if (X < 0 || Y < 0 || X >= bw || Y >= bh || !mask[Y * bw + X] || (sz !== undefined && zb[Y * bw + X] !== sz)) continue;
            const k = e < .45 ? .62 : e < .75 ? .74 : .86, q = (Y * bw + X) * 4; layer.d[q] *= k; layer.d[q + 1] *= k; layer.d[q + 2] *= k;
        }
        const dim = lv.closed ? (lv.dim || .5) : 1;
        const lamps = w.lamps.filter(l => !l.tele).map(l => { const key = lampKey(l.tx, l.ty); let c = (lv.closed && key % 3) ? null : M.lamp(l.free || l.colour || Mname !== "failing" ? 0 : key);
            /* a light with its own colour: as strong as the mood's lights, in that colour */
            if (c && l.colour) { const q = hex(l.colour.replace(/^#/, "")), top = Math.max(q[0], q[1], q[2], 1), power = Math.max(...c); c = q.map(v => v / top * power * (l.sign ? .42 : 1)); }
            return c && !l.dead ? { ...l, c } : null; }).filter(Boolean);
        const lightAt = (x, y, isFloor, zv) => {
            const L = [M.amb[0], M.amb[1], M.amb[2]], top = [0, 0, 0], rest = [0, 0, 0];
            for (const l of lamps) {
                const dxs = x - l.x; if (dxs > 340 || dxs < -340) continue;
                let d;
                if (isFloor) {
                    const rx = x - gx, ry = y - gy + zv, fx = (rx + 2 * ry) / 32, fy = (2 * ry - rx) / 32;
                    const lfx = l.free ? l.tx : l.axisY ? l.tx + 1.6 : l.tx, lfy = l.free ? l.ty : l.axisY ? l.ty : (l.ty + 1.6);
                    d = Math.sqrt((fx - lfx) * (fx - lfx) + (fy - lfy) * (fy - lfy)) / M.tiles;
                    const dz = Math.abs(zv - (l.lz === undefined ? zv : l.lz)); if (dz) d = Math.hypot(d, dz / 16 / M.tiles);
                } else {
                    const dh = y - l.y - dxs / 2 * (l.axisY ? -1 : l.free ? 0 : 1);
                    d = Math.sqrt(dxs * dxs + dh * dh * 1.2) / M.px;
                }
                if (d < 1) { const f = (1 - d) * (1 - d) * M.p; for (let k = 0; k < 3; k++) { const v = f * l.c[k]; if (v > top[k]) { rest[k] += top[k]; top[k] = v; } else rest[k] += v; } }
            }
            for (let k = 0; k < 3; k++) L[k] += top[k] + rest[k] * .28;
            return L;
        };
        const furniLight = new Map();
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
            const p = (y * bw + x) * 4;
            if (layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]) continue;
            if (w.glowing[y * bw + x] && w.glowing[y * bw + x] === ((layer.d[p] << 16) | (layer.d[p + 1] << 8) | layer.d[p + 2]) + 1) continue;   // a lit shade makes its own light
            /* The light itself is smooth. It used to be cut into 7 steps and dithered with a 4x4 pattern, which covered dark rooms in tiny diamonds.
               Furniture takes the light of the floor it stands on, so it isn't dark on a bright floor. */
            const i0 = y * bw + x, f = mask[i0] === 1;
            let L;
            if (furniX[i0] !== NO_FURNI) {
                /* Each column of a piece takes the light of the ground under it: along the middle of the run for a long piece, so the light passes smoothly from one end to the other, and through the middle of its tile for a single one */
                const fx0 = furniX[i0], fy0 = furniY[i0], run = furniRun[i0], kt = fx0 + "," + fy0 + "," + run + "," + x; L = furniLight.get(kt);
                if (!L) { const zt0 = zAt(fx0, fy0), zt = zt0 === null ? lowest : zt0, D = (x - gx) / 16, sum = run === 1 ? D + 2 * fy0 + 1 : run === 2 ? 2 * fx0 + 1 - D : fx0 + fy0 + 1; L = lightAt(x, sum * 8 + gy - zt, true, zt); furniLight.set(kt, L); }
            }
            else L = lightAt(x, y, f, zb[i0]);
            const k0 = L[0] * dim, k1 = L[1] * dim, k2 = L[2] * dim;
            layer.d[p] = Math.min(255, layer.d[p] * k0); layer.d[p + 1] = Math.min(255, layer.d[p + 1] * k1); layer.d[p + 2] = Math.min(255, layer.d[p + 2] * k2);
        }
        /* the tree's always lit, and lights the room round it */
        for (const g of w.treeGlows) { const X0 = Math.round(g[0]), Y0 = Math.round(g[1]) - 6, gl = (cx, cy, R, sy, a) => { for (let y = Math.max(0, Math.floor(cy - R * sy)); y < Math.min(bh, cy + R * sy); y++) for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(bw, cx + R); x++) { const d = Math.hypot(x - cx, (y - cy) / sy) / R; if (d >= 1) continue; const i = (y * bw + x) * 4, k = a * (1 - d); if (layer.d[i] === 7 && layer.d[i + 1] === 6 && layer.d[i + 2] === 10) continue; layer.d[i] = Math.min(255, layer.d[i] + 255 * k); layer.d[i + 1] = Math.min(255, layer.d[i + 1] + 190 * k); layer.d[i + 2] = Math.min(255, layer.d[i + 2] + 96 * k); } }; gl(X0, Y0, 60, .55, .3); gl(X0, Y0 - 34, 48, 1, .16); }
        if (w.sunWins.length) { const HT = { sofa: 14, chair: 14, table: 14, smtable: 14, ero: 20, ero_stone: 20, ero_walnut: 20, ero_evergreen: 20, ero_flower: 20, cabinet: 40, shelf: 40, plant: 26, statue: 60, fountain: 20, rarecase: 40, water: 30 }, heights = new Map(); for (const P of lv.patches) for (const p of (P.props || [])) { const ht = HT[p[0]]; if (ht) for (const t of Parts.tiles({ k: p[0], x: p[1], y: p[2], len: p[4], rot: p[5] })) heights.set(t[0] + "," + t[1], ht); }
            for (const s of w.sunWins) { const Sn = HallWindow.SUN, toTile = (mx, my) => s.flip ? [s.start + my / 16, s.line + mx / 16] : [s.line + mx / 16, s.start + my / 16], blocked = (mx, my, mz) => { const t = mx / Sn[0]; for (let k = .02; k < 1; k += .03) { const px = mx - k * mx, py = my - k * t * Sn[1], pz = mz - k * t * Sn[2], q = toTile(px, py), ht = heights.get(Math.floor(q[0]) + "," + Math.floor(q[1])); if (ht && pz < ht && pz >= 0) return true; } return false; };
                const far = (s.top + 4) / -Sn[2], side = far * Sn[1]; for (let y = Math.floor(Math.max(0, s.a1 - s.top - s.W)); y < Math.min(bh, s.a1 + (far + s.W + side) / 2 + 8); y++) for (let x = Math.floor(Math.max(0, s.flip ? s.a0 - far : s.a0 - s.W - side - 8)); x < Math.min(bw, s.flip ? s.a0 + s.W + side + 8 : s.a0 + far); x++) { const i0 = y * bw + x, sx = (s.flip ? s.a0 - x : x - s.a0), sy = y - s.a1, isF = mask[i0] === 1 && zb[i0] === s.z, isFur = furniX[i0] !== NO_FURNI && zb[i0] === s.z; let al = 0;
                    if (isF || isFur) { const z0 = isFur ? (heights.get(furniX[i0] + "," + furniY[i0]) || -1) : 0; if (z0 >= 0) { const syf = sy + z0, mx = syf + sx / 2, my = syf - sx / 2; if (mx > 0 && mx < far) { const q = toTile(mx, my), on = !isFur || (Math.floor(q[0]) === furniX[i0] && Math.floor(q[1]) === furniY[i0]), t = mx / Sn[0]; if (on) { const blur = .8 + mx * .07, ty = my - t * Sn[1], tz = z0 - t * Sn[2]; let got = 0; for (const [da, db] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]]) if (HallWindow.litByWindow(s.W, s.b, s.top, ty + da * blur, tz + db * blur)) got++; if (got && !blocked(mx, my, z0 + .3)) al += .26 * (got / 9) * (1 - .55 * mx / far); } } } }
                    /* the shaft in the air */
                    if (isF || isFur || wallOwner[i0]) for (let z = 8; z < s.top; z += 6) { const sy2 = sy + z, mx2 = sy2 + sx / 2, my2 = sy2 - sx / 2; if (mx2 > 0 && mx2 < far) { const t = mx2 / Sn[0]; if (HallWindow.litByWindow(s.W, s.b, s.top, my2 - t * Sn[1], z - t * Sn[2])) al += .011 * (1 - mx2 / far * .6); } }
                    if (al > 0) { const p = i0 * 4, m = Math.min(.5, al); layer.d[p] = layer.d[p] * (1 - m) + 255 * m; layer.d[p + 1] = layer.d[p + 1] * (1 - m) + 232 * m; layer.d[p + 2] = layer.d[p + 2] * (1 - m) + 170 * m; } } } }
        /* each lit lamp burns bright, whatever the ambient */
        for (const l of lamps) if (!l.free) for (let j = -3; j <= 9; j++) for (let i = -6; i <= 6; i++) { const X = l.x + i, Y = l.y + j + Math.floor(i / 2) * (l.axisY ? -1 : 1) - 6; if (X < 0 || Y < 0 || X >= bw || Y >= bh) continue; }
        const lampLit = [...lampPx.keys()].map(i => [i, layer.d[i * 4], layer.d[i * 4 + 1], layer.d[i * 4 + 2]]);
        /* A sign hangs on its wall, so anything nearer goes over it: furniture on the room's side of that wall, and floor higher than its wall's foot on the line of sight. */
        const maxZ = uneven ? Math.max(...drawList.map(q => q.z)) : 0;
        const covered = (x, y, z, line, alongY) => {
            const i = y * bw + x; if (line === null) return false;
            if (furniX[i] !== NO_FURNI && (alongY ? furniX[i] : furniY[i]) >= line) return true;
            /* a wall of a part that lies wholly in front of this sign's wall */
            const wo = wallOwner[i]; if (wo) { const Q = lv.patches[wo - 1]; if ((alongY ? Q.x0 : Q.y0) > line) return true; }
            if (!uneven) return false;
            for (let h = z + 4; h <= maxZ; h += 4) { const rx = x - gx, ry = y - gy + h, X = Math.floor((rx + 2 * ry) / 32), Y = Math.floor((2 * ry - rx) / 32), c = zAt(X, Y); if (c !== null && c >= h && (cut === null || c <= cut) && (alongY ? X : Y) >= line) return true; }
            return false;
        };
        /* a sign takes the room's light like the wall it hangs on, but its name stays just readable in the dark */
        const SIGN_MIN_LIGHT = .32;
        const onWall = (z, line, alongY, paint) => { layer.set = function (x, y, c) { if (x >= 0 && y >= 0 && x < bw && y < bh && covered(x, y, z, line, alongY)) return; const L = lightAt(x, y, false, z), keep = SIGN_MIN_LIGHT; Buf.prototype.set.call(layer, x, y, [Math.min(255, c[0] * Math.max(keep, L[0] * dim)), Math.min(255, c[1] * Math.max(keep, L[1] * dim)), Math.min(255, c[2] * Math.max(keep, L[2] * dim))]); }; paint(); delete layer.set; };
        if (!cfg.noSigns) for (const s of signs) if (!lv.closed) {
            const g = s.sign || {}, u = g.u || 0, v = g.v || 0, sh = s.alongY ? -1 : 1;
            if (g.hide) continue;                                       // the editor's showing this one live, being dragged
            onWall(s.wallZ, s.wallLine, !!s.alongY, () => signIso(layer, s.s[0] + u, s.s[1] + sh * Math.floor(u / 2) - v, s.name, { alongY: s.alongY, hover: s.hover, max: 14, w: g.w, h: g.h, way: colour }));
        }
        for (const [i, r, g, b2] of lampLit) { layer.d[i * 4] = r; layer.d[i * 4 + 1] = g; layer.d[i * 4 + 2] = b2; }
        if (!cfg.noSigns && !lv.closed) for (const q of stairPlaques) { if (q.sign.hide) continue; const u = q.sign.u || 0, v = q.sign.blade ? q.sign.v || 0 : 0; onWall(q.z, q.line, false, () => stairPlaque(layer, q.s[0] + u, q.s[1] + Math.floor(u / 2) - v, q.name)); }
        if (cfg.avatar && cfg.avatar.lv === lv.id) { const P = lv.patches.find(q => cfg.avatar.x >= q.x0 && cfg.avatar.x < q.x1 && cfg.avatar.y >= q.y0 && cfg.avatar.y < q.y1) || lv.patches[0]; const zz = P.z; const c = [Math.round((cfg.avatar.x - cfg.avatar.y) * 16) + gx, Math.round((cfg.avatar.x + cfg.avatar.y) * 8) + gy - zz + 8]; if (c[0] >= 0 && c[1] >= 0 && c[0] < bw && c[1] < bh) avL = lightAt(c[0], c[1], true, zz).map(v => Math.min(1.05, v)); w.avS = [c[0], c[1]]; }
        /* the cap of this floor's wall, wherever the floor above asked for it to go: the wallpaper's own repeat, from further down the same column */
        if (lv.noCap) {
            const REPEAT = 18, isVoid = i => { const p = i * 4; return layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]; };
            for (const [sx, y0, y1] of lv.noCap) for (let y = y0; y <= y1; y++) {
                if (sx < 0 || sx >= bw || y < 0 || y >= bh) continue;
                const i = y * bw + sx; if (isVoid(i) || furniX[i] !== NO_FURNI) continue;
                let yy = y; while (yy <= y1) yy += REPEAT; if (yy >= bh) continue;
                const j = yy * bw + sx; if (isVoid(j)) continue;
                layer.d[i * 4] = layer.d[j * 4]; layer.d[i * 4 + 1] = layer.d[j * 4 + 1]; layer.d[i * 4 + 2] = layer.d[j * 4 + 2];
            }
            delete lv.noCap;
        }
        /* A floor tile's stepped edge and the moulding under it can miss each other by a row on every other column, and what's on the floor below shows through the slit. Close them with the moulding's own colour. */
        {
            const isVoid = i => { const p = i * 4; return layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]; };
            let slits = 0;
            for (let y = 1; y < bh - 2; y++) for (let x = 0; x < bw; x++) {
                const i = y * bw + x; if (!isVoid(i) || !mask[i - bw]) continue;
                const below = !isVoid(i + bw) ? i + bw : -1; if (below < 0) continue;
                layer.d[i * 4] = layer.d[below * 4]; layer.d[i * 4 + 1] = layer.d[below * 4 + 1]; layer.d[i * 4 + 2] = layer.d[below * 4 + 2]; slits++;
            }
            if (cfg.report) (cfg.report.slits = cfg.report.slits || {})[lv.id || "?"] = slits;
        }
        /* In this view a line of sight climbs as it comes toward you, so of two things on one line the
           higher is always the nearer. Everything on a floor stands lower than the underside of the
           floor above. So the floors are drawn from the top down, and a lower one only ever fills
           what is still empty: it can never paint over anything above it. */
        for (let p = 0, i = 0; p < layer.d.length; p += 4, i++) {
            if (done[i]) continue;
            if (layer.d[p] === VOID[0] && layer.d[p + 1] === VOID[1] && layer.d[p + 2] === VOID[2]) continue;
            out.d[p] = layer.d[p]; out.d[p + 1] = layer.d[p + 1]; out.d[p + 2] = layer.d[p + 2]; done[i] = 1;
        }
    }
    return { report: levels.report, b: out, view, at: (x, y, z) => { const c = at(x, y, z); return [c[0] - view[0], c[1] - view[1]]; }, cfg, avL, avS: w.avS, doors: ni };
}
var w_total = 0;

function shot(world, px, py, vw, vh, zoom, o) {
    o = o || {};
    const qw = Math.ceil(vw / zoom), qh = Math.ceil(vh / zoom), cx = px - (qw >> 1), cy = py - (qh >> 1);
    const raw = world.b.crop(cx, cy, qw, qh);
    let out; if (zoom === 1) out = raw; else if (o.full) out = raw.scale2x(); else { out = new Buf(qw * zoom, qh * zoom); out.paste(raw, 0, 0, zoom); }
    const a = world.cfg.avatar;
    if (a && zoom === 2 && !world.cfg.avatarS && world.avS) {
        const im = avatarFile("m", a.dir, a.action || "std", a.frame || 0), fx = (world.avS[0] - cx) * 2, fy = (world.avS[1] - cy) * 2;
        for (let j = -5; j <= 5; j++) for (let i = -18; i <= 18; i++) if (i * i / 324 + j * j / 25 < 1 && (i + j) % 2 === 0) { const X = fx + i, Y = fy + j; if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.set(X, Y, out.get(X, Y).map(v => v * .55)); }
        const x0 = fx - (im.w >> 1), y0 = fy - im.h + 11, f = world.avL.map(v => Math.max(.45, v));
        for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) { const q = (j * im.w + i) * 4; if (im.rgba[q + 3] < 128) continue; out.set(x0 + i, y0 + j, [Math.min(255, im.rgba[q] * f[0]), Math.min(255, im.rgba[q + 1] * f[1]), Math.min(255, im.rgba[q + 2] * f[2])]); }
    }
    return out;
}
module.exports = { smallGlobe, lift, recolour, drawPortal, build, shot, plan, fromMap, WAYS, LIGHTS, LAMP_STYLES, signIso, stairPlaque, plaqueWidth, PLAQUE, floorLamp, H, Buf };

} };
MODULES["floor-lamps.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* The floor lamps. Each part is a real turned shape: a radius at every height, spun round the lamp's upright and seen
   from the room's own 2:1 view. Every pixel works out which way that surface faces and takes a tone from a hand-made
   ramp, so curves, pleats and panes wrap round the form; the black line goes round the finished silhouette last, so it
   never breaks. About as tall as a Habbo (50px) with a foot narrower than a tile. Drawn on a small grid, then handed
   over with each pixel marked as glowing or not: a lit shade makes its own light and the room's lighting leaves it. */
"use strict";
const fs = require("fs"), path = require("path");
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const ramp = s => s.split(" ").map(hex);
const R = {
    brass: ramp("2e1a07 4a2c0c 6b4412 8e601a b5842a d9aa44 f0cd78 fff0bd"),
    bronze: ramp("140b06 21130a 321d10 472b18 5f3c23 7c5232 a07448 cfa679"),
    antique: ramp("24130a 3a2110 54321a 6e4524 8c5c30 ab7a44 cc9f66 eed09c"),
    shadeLit: ramp("a8622a c67f38 e0a050 f2bd6e fbd58f ffe6ae fff2cd fffbe8"),
    shadeOff: ramp("7d6a4c 94805e aa9672 bdaa86 cdbb98 dccba9 e8d9ba f2e7cd"),
    trimLit: ramp("5e3410 8a5418 b57c28 d9a440 f4cc70"),
    trimOff: ramp("3f2a10 5c3e16 7c5620 9c7230 bc9244"),
    alabLit: ramp("b56f30 d08a42 e8a95c f6c67e ffdd9e ffecbf fff6da fffdf0"),
    alabOff: ramp("8a7a60 a09078 b5a68e c6b9a2 d5cab5 e2d9c7 ece5d6 f6f1e6"),
    inLit: ramp("e8b56c f6cf8c ffe2ad fff1cf fffae8 ffffff"),
    inOff: ramp("7c6a4e 8f7c5e a18f70 b3a182 c4b394 d3c4a8")
};
/* a tone from 0 to 1 on a ramp */
const pick = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
const LIGHT = [-.58, .62, .53], VIEW = [0, .45, .89];
const norm = v => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const HALF = norm([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function canvas() {
    const W = 64, H = 84, OX = 32, OY = 72, col = new Array(W * H).fill(null), glow = new Uint8Array(W * H), cell = new Int32Array(W * H);
    const at = (x, y) => { const X = x + OX, Y = y + OY; return X < 0 || Y < 0 || X >= W || Y >= H ? -1 : Y * W + X; };
    const put = (x, y, c, g, id) => { const i = at(x, y); if (i < 0) return; col[i] = c; glow[i] = g ? 1 : 0; cell[i] = id || 0; };
    /* spin a radius round the upright, from height h0 up to h1. Higher points go on last: of two on a line of sight the higher is nearer. */
    const spin = (h0, h1, rf, shade) => {
        for (let h = h0; h <= h1 + 1e-6; h += .125) {
            const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0, r = rf(t); if (r <= 0) continue;
            const dt = .02, dr = (rf(Math.min(1, t + dt)) - rf(Math.max(0, t - dt))) / (dt * 2 * Math.max(.5, h1 - h0));
            for (let i = -Math.floor(r); i <= Math.floor(r); i++) {
                const s = i / r, c = Math.sqrt(Math.max(0, 1 - s * s)), n = norm([s, -dr, c]);
                const y = Math.round(-h + r / 2 * c), o = shade({ s, c, n, t, h, i, r });
                if (o) put(i, y, o.c || o, o.g, o.id);
            }
        }
    };
    /* a flat ring or disc looking up at you */
    const disc = (h, r, shade) => {
        const ry = r / 2, Y0 = Math.round(-h);
        for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
            const e = (i * i) / (r * r) + (j * j) / (ry * ry); if (e > 1.02) continue;
            const o = shade(i, j, e); if (o) put(i, Y0 + j, o.c || o, o.g, o.id);
        }
    };
    /* a dark line along the front of an edge, where one part sits on another */
    const crease = (h, r, c) => { for (let i = -Math.floor(r); i <= Math.floor(r); i++) { const s = i / r, y = Math.round(-h + r / 2 * Math.sqrt(1 - s * s)), k = at(i, y); if (k >= 0 && col[k]) { col[k] = c; glow[k] = 0; } } };
    /* lead between panes: wherever two panes meet, one pixel of it */
    const leadLines = (c) => {
        for (let Y = 0; Y < H - 1; Y++) for (let X = 0; X < W - 1; X++) {
            const i = Y * W + X, id = cell[i]; if (!id || !col[i]) continue;
            const a = cell[i + 1], b = cell[i + W];
            if ((a && a !== id) || (b && b !== id)) { col[i] = c; glow[i] = 0; }
        }
    };
    /* the black line round the outside */
    const outline = () => {
        const add = [];
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
            if (col[Y * W + X]) continue;
            const f = (a, b) => a >= 0 && b >= 0 && a < W && b < H && col[b * W + a];
            if (f(X - 1, Y) || f(X + 1, Y) || f(X, Y - 1) || f(X, Y + 1)) add.push(Y * W + X);
        }
        for (const i of add) col[i] = [0, 0, 0];
    };
    return { W, H, OX, OY, col, glow, spin, disc, crease, leadLines, outline, putPx: put };
}

/* polished metal: light on the left, a dark band turning away, a little light thrown back at the far edge */
const metal = (r, k = 0) => ({ s, n }) => {
    const d = dot(n, LIGHT), sp = Math.pow(Math.max(0, dot(n, HALF)), 22);
    const back = s > .82 ? .14 : 0;
    return pick(r, .3 + .36 * d + .62 * sp + back + k);
};
const lerp = (a, b, t) => a + (b - a) * t, sine = t => Math.sin(t * Math.PI), ease = t => t * t * (3 - 2 * t);

/* the foot, the same family on each: a moulded edge, a swelling dome, a neck. ribs: the bronze one's rib work */
function foot(g, r, ribs) {
    const m = metal(r);
    g.spin(0, 1.5, () => 6.5, m);
    g.disc(1.5, 6.5, (i, j, e) => e > .68 ? pick(r, i + j < 0 ? .86 : .5) : null);
    g.crease(1.5, 5.1, r[1]);
    g.spin(1.5, 4.5, t => lerp(5.2, 1.7, ease(t)), ribs ? q => { const v = Math.cos(Math.asin(q.s) * ribs); return pick(r, .26 + .36 * dot(q.n, LIGHT) + (v > .35 ? .22 : v < -.35 ? -.1 : 0)); } : m);
    g.spin(4.5, 6, t => 1.7 + .9 * sine(t), m);
    g.crease(4.5, 1.8, r[1]);
}
function collar(g, r, h, rad, tall = 2) {
    g.spin(h, h + tall, t => lerp(rad - .6, rad, sine(t)), metal(r, .05));
    g.crease(h, rad - .6, r[0]);
}

function hotel(g, off) {
    const r = R.brass, stem = metal(r);
    foot(g, r);
    g.spin(6, 13, () => 1.5, stem);
    g.spin(13, 20, t => 1.5 + 1.7 * sine(Math.pow(t, .8)), stem);                 // a turned vase in the stem
    g.crease(13, 1.5, r[1]); g.crease(20, 1.5, r[1]);
    g.spin(20, 29, () => 1.5, stem);
    collar(g, r, 23, 2.6);
    g.spin(29, 34, t => lerp(1.5, 2.6, t), stem);
    /* the shade. Light from the bulb is brightest level with it, and pleats wrap round the drum, closing up at the sides */
    const SH = off ? R.shadeOff : R.shadeLit, TR = off ? R.trimOff : R.trimLit, H0 = 33, H1 = 45, RB = 9.5, RT = 6;
    g.spin(H0, H1, t => lerp(RB, RT, t), ({ s, n, t }) => {
        const th = Math.asin(s), pleat = Math.cos(th * 15);
        if (t < .09 || t > .94) return { c: pick(TR, .5 + (s < 0 ? .3 : -.12) * (1 - Math.abs(s)) - .42 * Math.max(0, s) + (Math.abs(pleat) > .8 && t < .09 ? .1 : 0)), g: !off };
        if (t < .15 || t > .89) return { c: pick(SH, off ? .34 : .24), g: !off };
        if (off) return { c: pick(SH, .54 + .48 * dot(n, LIGHT) + .1 * pleat), g: false };
        const bulb = Math.exp(-((s * s) / .55 + ((t - .42) * (t - .42)) / .28));
        return { c: pick(SH, .08 + .84 * bulb + .1 * pleat - .12 * Math.max(0, s)), g: true };
    });
    /* the open top: the rim, the far wall of the shade lit inside, the top of the bulb, and a finial on its pin */
    const I = off ? R.inOff : R.inLit;
    g.disc(H1 + .5, RT, (i, j, e) => e > .62 ? { c: pick(TR, i + j < 0 ? 1 : .55), g: !off } : { c: pick(I, off ? .2 + .5 * (1 - e) : .25 + .75 * (1 - e)), g: !off });
    g.spin(H1, H1 + 2.5, () => .9, ({ s }) => pick(R.bronze, s < 0 ? .7 : .5));
    g.spin(H1 + 2.5, H1 + 4.5, t => 1.1 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))) + .4, metal(r, .1));
    g.outline();
    return 38;
}

function torch(g, off) {
    const r = R.brass, stem = metal(r);
    foot(g, r);
    g.spin(6, 20, t => lerp(1.5, 1.1, t), stem);
    g.spin(20, 24, t => 1.2 + 1.5 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))), stem);        // a turned ball halfway up
    g.crease(20, 1.2, r[1]); g.crease(24, 1.2, r[1]);
    g.spin(24, 34, t => lerp(1.1, 1.3, t), stem);
    /* a flared cup that carries the bowl */
    g.spin(33, 37, t => lerp(1.3, 3.2, t * t), metal(r, .06));
    /* the bowl: alabaster, its flutes running up and opening out; the light comes through it from inside */
    const A = off ? R.alabOff : R.alabLit, H0 = 36, H1 = 47, RB = 2.8, RT = 10;
    const bowl = t => lerp(RB, RT, Math.pow(t, .8));
    g.spin(H0, H1, bowl, ({ s, n, t }) => {
        const flute = Math.cos(Math.asin(s) * 12), band = (t * 9 + Math.sin(s * 4) * .9) % 3 < .34;       // a faint vein through the stone
        if (off) return { c: pick(A, .36 + .5 * dot(n, LIGHT) + .1 * flute - (band ? .05 : 0)), g: false };
        return { c: pick(A, .04 + .58 * t + .15 * flute - .2 * Math.max(0, s) + .12 * (1 - Math.abs(s)) - (band ? .05 : 0)), g: true };
    });
    /* the rim in brass, and inside it the far wall of the bowl going up to white over the bulb */
    const I = off ? R.inOff : R.inLit;
    g.disc(H1 + .5, RT + .4, (i, j, e) => {
        if (e > .74) return { c: pick(r, i + j < 0 ? .86 : j > 0 ? .44 : .62), g: !off };
        const e2 = e / .74, far = j < 0 ? .12 : -.1;
        return { c: pick(I, off ? .1 + .6 * (1 - e2) : .02 + 1.1 * (1 - e2) + far), g: !off };
    });
    g.outline();
    return 45;
}

const JEWEL = { ruby: "d8402a", garnet: "a92a22", amber: "f2a033", honey: "ffcd62", cream: "ffe6a8", emerald: "379c5e", moss: "6c9a3a", teal: "2c8a78" };
/* The same family as the globe: its square foot and straight pole in the same antique metal, in clean upright bands. The shade is a plain dome of a few large panes,
   amber above a ruby border, each a clean run of tone with one thin line of lead between. Tones go by how far across the dome you are, like the metal, so nothing speckles. */
const GLASS = {
    amberLit: ramp("c47a2c e09a3e f4bd62 ffd98e ffecbc"), rubyLit: ramp("7c241c a43428 c84c38 e06c52 f08a6c"),
    amberOff: ramp("5a3a1c 75502a 916a38 ab854c c4a266"), rubyOff: ramp("3c1612 56211a 702e24 8a3e30 a35240")
};
function tiffany(g, off) {
    const r = R.antique, m = clean(r), LEAD = hex("2a170b");
    block(g, r, 0, 2, 6); block(g, r, 2, 3, 3);
    g.spin(3, 31, () => 1, m);
    const H0 = 30, H1 = 40, RD = 10, A = off ? GLASS.amberOff : GLASS.amberLit, B = off ? GLASS.rubyOff : GLASS.rubyLit, BORDER = 3.4, TIER = 6.6;
    const dome = t => RD * Math.pow(Math.max(0, 1 - Math.pow(t, 2.8)), .5);
    g.spin(H0, H1, dome, ({ s, h, i, r: rad }) => {
        const up = h - H0;
        if (up < .9) return pick(r, bandAt(s));                                                       // the metal rim
        if (Math.abs(up - BORDER) < .5 || Math.abs(up - TIER) < .5) return { c: LEAD, g: false };      // the lead between the rows
        /* the panes staggered row on row: two seams in the big row, one above it */
        const row = up < BORDER ? 0 : up < TIER ? 1 : 2, seams = row === 1 ? [-.46, .46] : row === 2 ? [0] : [-.72, 0, .72];
        if (seams.some(q => i === Math.round(q * rad))) return { c: LEAD, g: false };
        const cross = 1 - s * s, shade = off ? bandAt(s) * .9 + .12 : .12 + .88 * cross - .14 * Math.max(0, s);
        return { c: pick(row === 0 ? B : A, row === 0 ? shade - .2 : shade), g: !off };
    });
    /* the crown and a plain knob, in the base's metal */
    g.spin(H1 - 1.5, H1 + .5, t => lerp(3.4, 2.6, t), m);
    g.disc(H1 + .5, 2.6, (i, j) => pick(r, i + j < 0 ? .9 : .6));
    g.outline();
    return 34;
}

/* A low lamp, half the uplighter's height, with a round glass globe. Built from the floor up the way a real one is: a weighted foot with a
   moulded edge, a raised boss the pole screws into with a flange round its base, the pole, then a turned socket with a gallery ring that
   the globe sits in. A sphere is round from every angle, so the globe is a true circle, not a squashed ellipse. */
const GLOBE_LIT = ramp("c98a48 e0a662 f2c488 fbdba8 ffeac6 fff4dd fffaee ffffff"), GLOBE_OFF = ramp("6f6a68 8a8583 a39f9c b9b5b1 ccc8c3 dcd9d4 ebe9e5 ffffff");
/* Clean metal for small turned parts: the tone goes by how far across the part you are, in even upright bands, and a surface sloping up to you is a step lighter.
   Lighting each pixel by its true angle looks mottled at this size, which is what made the first base look amateur. */
const BANDS = [[-1, .34], [-.82, .62], [-.5, .98], [-.22, .78], [.12, .54], [.5, .34], [.84, .18], [1, .3]];
const bandAt = s => { for (let i = 1; i < BANDS.length; i++) if (s <= BANDS[i][0]) { const [x0, a0] = BANDS[i - 1], [x1, a1] = BANDS[i]; return a0 + (a1 - a0) * (s - x0) / (x1 - x0); } return .3; };
const clean = (r, k = 0) => ({ s, n }) => pick(r, bandAt(s) + k + Math.max(0, n[1]) * .16);
/* Straight lines only: he found curved bases too curvy. Flat rounds and straight sides, every part a plain turned shape. */
/* a square block on the 2:1 slant: light top, lit left face, shaded right face, and a bright line along the top's front edges */
function block(g, r, h0, h1, w) {
    for (let x = -w; x <= w; x++) {
        const dy = Math.floor((w - Math.abs(x)) / 2), edge = -h1 + dy;
        for (let y = -h1 - dy; y < edge; y++) g.putPx(x, y, pick(r, x + y + h1 < 0 ? .72 : .62));
        g.putPx(x, edge, pick(r, x <= 0 ? .95 : .7));
        for (let y = edge + 1; y <= -h0 + dy; y++) g.putPx(x, y, pick(r, x < 0 ? .46 : x === 0 ? .36 : .2));
    }
}
const cup = (g, m, from) => g.spin(from, 13, t => lerp(1, 2.5, t), m);
const GLOBE_BASES = {
    /* a square foot in two steps, so its edges run straight along the floor's own lines, and a straight pole */
    square(g, r, m) {
        block(g, r, 0, 2, 6); block(g, r, 2, 3, 3);
        g.spin(3, 11, () => 1, m);
        cup(g, m, 11);
    }
};
const GLOBE = { base: "square", metal: "antique" };
function globe(g, off, opt) {
    const o = opt || GLOBE, r = R[o.metal], m = clean(r);
    GLOBE_BASES[o.base](g, r, m);
    /* the globe, a true circle: light from inside when lit, frosted glass with a highlight when not */
    const RAD = 5.5, CY = 18.5;
    const X0 = -Math.ceil(RAD), Y0 = -Math.ceil(RAD);
    for (let j = Y0; j <= -Y0; j++) for (let i = X0; i <= -X0; i++) {
        const dd = i * i + j * j; if (dd > RAD * RAD) continue;
        const nx = i / RAD, ny = -j / RAD, nz = Math.sqrt(Math.max(0, 1 - dd / (RAD * RAD))), n = [nx, ny, nz], d = dot(n, LIGHT), sp = Math.pow(Math.max(0, dot(n, HALF)), 40);
        let c;
        if (off) c = pick(GLOBE_OFF, .14 + .5 * Math.max(0, d * .5 + .5) + .22 * nz + (sp > .5 ? .5 : 0));
        else c = pick(GLOBE_LIT, .02 + .86 * nz * nz + .12 * Math.max(0, d) - .08 * Math.max(0, nx));
        g.putPx(i, Math.round(-CY) + j, c, true);        // out of the room's lighting either way, which would speckle its smooth shading
    }
    /* the gallery ring holding it, in front of the globe's foot */
    g.spin(13, 14.5, t => lerp(2.8, 3.2, t), metal(r, .1));
    g.crease(13, 2.8, r[0]);
    g.disc(14.5, 3.2, (i, j, e) => j < 0 ? null : e > .55 ? pick(r, i < 0 ? .95 : .6) : null);
    g.outline();
    return 18;
}
const STYLES = { hotel: "Hotel drum", torch: "Uplighter", tiffany: "Stained glass", globe: "Globe" };
const KINDS = { hotel, torch, tiffany, globe };

/* a glowing colour, seen through a shade lit in a colour you chose: the dark of it takes the colour, the brightest stays nearly white */
function tintGlow(c, code) {
    const t = hex(String(code).replace(/^#/, "")), l = (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255, hot = Math.pow(l, 7) * .55;
    return t.map(v => Math.min(255, Math.round(v * (.28 + .86 * l) * (1 - hot) + 255 * hot)));
}
/* The globe lamp is his to draw: art/lamps/globe-lamp.png, lit on the left half, off on the right, at the size it appears. Save over it and the map updates.
   Without a readable file, it falls back on the drawn one. */
const { readPng } = require("../../png-decode.js");
const SHEET = path.join(__dirname, "..", "art", "lamps", "globe-lamp.png"), GLOBE_FOOT_UP = 6, GLOBE_MID = 18, GLOBE_RAD = 5.5, RING_TOP = -13;
let sheet = null;
function globeSheet() {
    try {
        const at = fs.statSync(SHEET).mtimeMs;
        if (!sheet || sheet.at !== at) { const im = readPng(SHEET); sheet = { at, im, memo: new Map() }; }
    } catch (e) { /* half-saved or missing: keep what we had */ }
    return sheet;
}
function pixelsFromSheet(sh, off, colour) {
    const k = (off ? "off" : "lit") + (colour && !off ? colour : ""); if (sh.memo.has(k)) return sh.memo.get(k);
    const { im } = sh, FW = im.w >> 1, OX = FW >> 1, OY = im.h - GLOBE_FOOT_UP, list = [], x0 = off ? FW : 0;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < FW; x++) {
        const q = (y * im.w + x0 + x) * 4; if (im.rgba[q + 3] < 128) continue;
        const dx = x - OX, dy = y - OY, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]];
        /* the glass makes its own light; the metal ring across its foot doesn't */
        const glass = Math.hypot(dx, dy + GLOBE_MID) <= GLOBE_RAD && dy < RING_TOP && !(dy === RING_TOP - 1 && Math.abs(dx) > 2);
        list.push([dx, dy, glass && colour && !off ? tintGlow(c, colour) : c, glass]);
    }
    const v = { list, lightH: 18 }; sh.memo.set(k, v); return v;
}
/* The globe wall light is his to draw too: art/lamps/globe-wall-light.png, 32x24 frames, top row lit, bottom row off, left frame for a wall or face looking left, right frame looking right.
   The point on the wall is at (16, 14) in each frame. */
const WALL_SHEET = path.join(__dirname, "..", "art", "lamps", "globe-wall-light.png");
/* and from behind, for the faces of a pillar turned away from you: globe-wall-light-back.png, the same layout with the fixing point at (16, 17). The pillar hides the plate. */
const BACK_SHEET = path.join(__dirname, "..", "art", "lamps", "globe-wall-light-back.png");
const wallSheets = new Map();
function wallLight(out, off, colour, back) {
    const file = back ? BACK_SHEET : WALL_SHEET; let wallSheet = wallSheets.get(file);
    try {
        const at = fs.statSync(file).mtimeMs;
        if (!wallSheet || wallSheet.at !== at) { const im = readPng(file); wallSheet = { at, im, memo: new Map() }; wallSheets.set(file, wallSheet); }
    } catch (e) { /* half-saved or missing: keep what we had */ }
    if (!wallSheet) return null;
    const k = out + (off ? "off" : "lit") + (colour && !off ? colour : ""); if (wallSheet.memo.has(k)) return wallSheet.memo.get(k);
    const OY = back ? 17 : 14, GY = back ? 10 : 6, { im } = wallSheet, FW = 32, FH = 24, x0 = out < 0 ? 0 : FW, y0 = off ? FH : 0, list = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const X = x0 + x, Y = y0 + y; if (X >= im.w || Y >= im.h) continue;
        const q = (Y * im.w + X) * 4; if (im.rgba[q + 3] < 128) continue;
        const dx = x - 16, dy = y - OY, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]], glass = Math.hypot(dx - out * 8, dy + GY) <= 3.5;
        list.push([dx, dy, glass && colour && !off ? tintGlow(c, colour) : c, glass]);
    }
    wallSheet.memo.set(k, list); return list;
}
/* The wall light is his to draw as well: art/lamps/wall-light.png, 40x40 frames, top row lit, bottom row off, left frame for a back wall, right frame for a left wall, with the point on the wall at (20, 25).
   The shade is whatever sits above the cup, out at the end of the arm: that part makes its own light and takes a light's colour. */
const SCONCE_SHEET = path.join(__dirname, "..", "art", "lamps", "wall-light.png");
let sconceSheet = null;
function sconce(out, off, colour) {
    try {
        const at = fs.statSync(SCONCE_SHEET).mtimeMs;
        if (!sconceSheet || sconceSheet.at !== at) sconceSheet = { at, im: readPng(SCONCE_SHEET), memo: new Map() };
    } catch (e) { /* half-saved or missing: keep what we had */ }
    if (!sconceSheet) return null;
    const k = out + (off ? "off" : "lit") + (colour && !off ? colour : ""); if (sconceSheet.memo.has(k)) return sconceSheet.memo.get(k);
    const { im } = sconceSheet, FW = 40, FH = 40, x0 = out < 0 ? 0 : FW, y0 = off ? FH : 0, list = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const X = x0 + x, Y = y0 + y; if (X >= im.w || Y >= im.h) continue;
        const q = (Y * im.w + X) * 4; if (im.rgba[q + 3] < 128) continue;
        const dx = x - 20, dy = y - 25, c = [im.rgba[q], im.rgba[q + 1], im.rgba[q + 2]], glass = !off && dy <= -5 && Math.abs(dx - out * 11) <= 8;
        list.push([dx, dy, glass && colour ? tintGlow(c, colour) : c, glass]);
    }
    sconceSheet.memo.set(k, list); return list;
}
const memo = new Map();
/* every pixel of one design, off or lit: [dx, dy, [r, g, b], glowing], and how far up its light sits */
function pixels(kind, off, colour, opt) {
    if (kind === "globe" && !opt) { const sh = globeSheet(); if (sh) return pixelsFromSheet(sh, off, colour); }
    const k = kind + (off ? "|off" : "|lit") + (colour && !off && kind !== "tiffany" ? colour : "") + JSON.stringify(opt || (kind === "globe" ? GLOBE : 0));
    if (memo.has(k)) return memo.get(k);
    const g = canvas(), lightH = KINDS[kind](g, off, opt), list = [];
    for (let Y = 0; Y < g.H; Y++) for (let X = 0; X < g.W; X++) { const c = g.col[Y * g.W + X]; if (c) { const lit = !!g.glow[Y * g.W + X]; list.push([X - g.OX, Y - g.OY, lit && colour && kind !== "tiffany" ? tintGlow(c, colour) : c, lit]); } }
    const v = { list, lightH };
    memo.set(k, v);
    return v;
}
module.exports = { STYLES, pixels, tintGlow, wallLight, sconce, GLOBE, GLOBE_LIT, GLOBE_OFF };

} };
MODULES["edge-items.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* Railings along the edge of a floor, painted with the editor's brush.
   Stored per tile of edge, l.edgeItems [{ s, axis, line, t, in }]: axis "x" runs along x on line y = line, axis "y" along y on line x = line, like walls.
   in: which way the tile it stands on lies, +1 towards a higher line number, -1 towards a lower one. Touching tiles join into one run; on small steps a run climbs with them.
   Drawn by hand. A post is a fixed pixel stamp, always upright whatever the floor does, so it can't shear on a slope; the rail is four rows laid column by column
   along an exact straight line: dark line, side, lit top, dark line. */
(function () {
"use strict";
const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const paint = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rgb(v)]));
const STYLES = { wood: "Dark oak rail", gold: "Gold rail" };
/* posts from the floor up; '.' is see-through, the light falls from the left */
const LOOK = {
    wood: {
        c: paint({ K: "120a05", h: "a87c4a", l: "8e6638", m: "5e3e22", d: "432a16", e: "2e1c0e" }), grain: true,
        post: [
            ".KKKK.", "KmmddK", "KhlmdK",
            ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.",
            "KmmddK", "KhlmdK",
            ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KmdK.",
            "..KK..", ".KmdK.", ".KhlK.", "..KK.."
        ]
    },
    /* one slim post on a small round foot, with a true round ball on top */
    gold: {
        c: paint({ K: "2c1c06", h: "e4c47c", l: "c49a48", m: "a0742c", d: "86601f", e: "6a4814" }),
        post: [
            ".KKKK.", "KlmmdK",
            ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.", ".KldK.",
            "..KK..", ".KmdK.", "KlmmdK", "KhlmmK", ".KhhK.", "..KK.."
        ]
    }
};
const T = 16, RAIL = 14;   // the rail's lower line, in rows up from the floor
/* All the pixels of one run: [X, Y, colour, which tile of the run]. at(fx, fy) gives the screen spot on the run's floor; lift(along) how far the floor there has climbed. */
function pixels(run, at, lift) {
    const { s, axis, line, a, b, dir } = run, look = LOOK[s] || LOOK.wood, C = look.c, out = new Map(), a0 = a * T, a1 = b * T, put = (x, y, c, t) => out.set(x + "," + y, [x, y, c, t]);
    /* The floor's own spots are rounded to whole pixels, and rounding them again after adding a slope's climb makes the rail wobble. So: one spot, then the exact line from it. */
    const away = 2 / T, start = axis === "x" ? at(a, line + dir * away) : at(line + dir * away, a), sx = axis === "x" ? 1 : -1;
    const spot = A => { const along = (A + .5) / T, d = along - a; return [Math.round(start[0] + sx * d * 16), Math.round(start[1] + d * 8 - lift(along))]; };
    /* the side facing +y catches more light than the one facing +x */
    const side = axis === "x" ? ["m", "d"] : ["d", "e"];
    let lastY = null;
    for (let A = a0; A < a1; A++) {
        const [X, Y] = spot(A), g = look.grain && (A * 7) % 23 < 3 ? 1 : 0, glint = look.grain ? (A * 5) % 37 < 2 : (((A % 16) + 16) % 16) < 8;
        /* on a steep climb, fill between this column and the last, so the rail never breaks */
        const from = lastY === null ? Y : Math.min(Y, lastY), to = lastY === null ? Y : Math.max(Y, lastY);
        const t = Math.floor(A / T);
        for (let y = from; y <= to; y++) { put(X, y - RAIL, C.K, t); put(X, y - RAIL - 1, C[side[g]], t); }
        put(X, Y - RAIL - 1, C[side[g]], t); put(X, Y - RAIL - 2, glint && look.grain ? C.h : C.l, t); put(X, Y - RAIL - 3, C.K, t);
        lastY = Y;
    }
    const posts = new Set([a0 + 2, a1 - 2]);
    for (let A = Math.ceil((a0 + 8) / 32) * 32; A < a1 - 8; A += 32) posts.add(A);
    for (const c of posts) {
        const [X, Y] = spot(c);
        look.post.forEach((row, h) => { for (let i = 0; i < 6; i++) if (row[i] !== ".") put(X + i - 3, Y - h, C[row[i]], Math.floor(c / T)); });
    }
    return [...out.values()];
}
/* Touching tiles of one style, line and side join into runs. */
function runsOf(items) {
    const groups = new Map(), runs = [];
    for (const q of items) { const k = [q.s, q.axis, q.line, q.in].join("|"); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q.t); }
    for (const [k, list] of groups) {
        const [s, axis, line, dir] = k.split("|"); list.sort((x, y) => x - y);
        let a = list[0], prev = list[0];
        for (let i = 1; i <= list.length; i++) { if (list[i] !== prev + 1) { runs.push({ s, axis, line: +line, dir: +dir, a, b: prev + 1 }); a = list[i]; } prev = list[i]; }
    }
    return runs;
}
if (typeof module !== "undefined") module.exports = { STYLES, pixels, runsOf };
if (typeof window !== "undefined") window.EdgeItems = { STYLES, pixels, runsOf };
})();

} };
MODULES["rope-barrier.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* The rope barrier: two poles, a hanging rope with a clasp at each end, and a wooden card in the middle (or not: p.noCard).
   A placed piece is { k: "rope", x, y, len, rot, noCard? }. It stands on a row of tiles and avatars can't cross them, like any furniture.
   Shared by the drawing (render/hw3.js) and the editor (placing ghost, cutting the Habbo), so the two can't disagree.
   Colours are the globe lamp's own (art/lamps/globe-lamp.png), its foot rounded; h is a step between its l and W, for the clasp. */
(function () {
"use strict";
const rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const paint = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rgb(v)]));
const G = paint({ K: "000000", W: "eed09c", h: "c49660", l: "ab7a44", d: "6e4524", s: "54321a", L: "8c5c30", M: "ab7a44", N: "eed09c", O: "6e4524", P: "3a2110" });
const ROPE = paint({ lit: "a8322e", lit2: "8a1f22", mid: "641015", line: "220406" });
const CARD = paint({ K: "26140a", top: "b08248", face: "8e6030", ink: "2e1a0c", str: "2a0a08" });
const SHAFT = ".....KsLsK.....", GLINT = ".....KsMsK.....", HOT = ".....KsNsK.....";
const POLE = [
    "......KKK......",
    ".....KNMLK.....",
    "....KNNMLOK....",
    "....KMMLLOK....",
    "....KLLLOPK....",
    ".....KLOPK.....",
    "....KNMLOPK....",
    ".....KKKKK.....",
    HOT, GLINT, GLINT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, GLINT, HOT, GLINT, SHAFT, SHAFT,
    "...KKMsLsMKK...",
    ".KKMMNsLsMMLKK.",
    "KNNMMMNLMMMMLLK",
    "KNMMMMMMMMMMMLK",
    "KOONMMMMMMMMLPK",
    ".KOOONNMMMLPPK.",
    "..KKOOOOPPPKK..",
    "....KKKKKKK...."
];
const FOOT = POLE.length - 5;      // the stamp's row that stands on the floor: the middle of the disc's top
const ATTACH = FOOT - 6;           // rows up from the floor where the rope clips on: the ring under the ball
const IN = .36;                    // how far in from the run's ends the poles stand, in tiles
const END = 7;                     // columns from a pole's centre that its clasp takes
const CARD_W = 17, CARD_H = 10, CARD_DROP = 3;
const MIN_FOR_CARD = 3;            // on 2 tiles the clasps and the card leave no rope to see

/* at(fx, fy) gives the screen spot on the floor there. Returns { list: [X, Y, colour, tile of the run], feet: [[X, Y, tile]] }, far pole first, in painting order. */
function pixels(p, at) {
    const n = Math.max(2, p.len || 3), along = !!p.rot, spot = d => along ? at(p.x + .5, p.y + d) : at(p.x + d, p.y + .5);
    const a = spot(IN), b = spot(n - IN), list = [], put = (x, y, c, t) => list.push([x, y, c, t]);
    const part = p.part, poles = part !== "rope" && part !== "hanging", cords = part !== "poles" && part !== "hanging";
    const pole = (f, t) => { if (poles) POLE.forEach((row, r) => { for (let i = 0; i < 15; i++) if (row[i] !== ".") put(f[0] + i - 7, f[1] + r - FOOT, G[row[i]], t); }); };
    const dir = b[0] > a[0] ? 1 : -1, wide = Math.abs(b[0] - a[0]), sag = Math.min(11, 3 + n * 1.3);
    const yAt = X => { const t = Math.abs(X - a[0]) / wide; return a[1] + (b[1] - a[1]) * t - ATTACH + sag * 4 * t * (1 - t); };
    pole(a, 0);
    let last = null;
    /* unclipped: it hangs from the near pole */
    if (part === "hanging") for (let k = 0; k < 16; k++) { put(b[0] + 3, b[1] - ATTACH + k, k < 2 ? G.l : k % 4 < 2 ? ROPE.lit : ROPE.mid, n - 1); put(b[0] + 4, b[1] - ATTACH + k, ROPE.line, n - 1); }
    if (cords) for (let k = END; k <= wide - END; k++) {
        const X = a[0] + dir * k, y = Math.round(yAt(X)), from = last === null ? y : Math.min(y, last), to = last === null ? y : Math.max(y, last);
        const t = Math.max(0, Math.min(n - 1, Math.floor(IN + (k / wide) * (n - 2 * IN))));
        put(X, from - 1, ((k + Math.floor(k / 2)) % 4) < 2 ? ROPE.lit : ROPE.lit2, t);
        for (let q = from; q <= to; q++) put(X, q, ROPE.mid, t);
        put(X, to + 1, ROPE.line, t);
        last = y;
    }
    /* A clasp: a ring on the pole, a thin hook, and a short sleeve the rope goes into. The far pole's is painted over its shaft; the near pole is painted after its own, so that hook goes round the back. */
    const clasp = (from, sign, t) => {
        const R = [from[0] + sign * 3, from[1] - ATTACH], Qx = from[0] + sign * END, Q = [Qx, Math.round(yAt(Qx))];
        const L = Math.hypot(Q[0] - R[0], Q[1] - R[1]) || 1, ux = (Q[0] - R[0]) / L, uy = (Q[1] - R[1]) / L;
        const seg = (s0, s1, r, shade) => {
            const x0 = Math.floor(R[0] + ux * s0), x1 = Math.floor(R[0] + ux * s1), y0 = Math.floor(R[1] + uy * s0), y1 = Math.floor(R[1] + uy * s1);
            for (let y = Math.min(y0, y1) - 4; y <= Math.max(y0, y1) + 4; y++) for (let x = Math.min(x0, x1) - 4; x <= Math.max(x0, x1) + 4; x++) {
                const dx = x - R[0], dy = y - R[1], s = Math.max(s0, Math.min(s1, dx * ux + dy * uy)), nx = dx - ux * s, ny = dy - uy * s, d = Math.hypot(nx, ny);
                if (d <= r + .5) put(x, y, shade(d, ny, r), t);
            }
        };
        const sleeveAt = Math.max(0, L - 3);
        seg(0, sleeveAt, 1.2, (d, ny) => d > .85 ? G.K : ny < 0 ? G.h : G.l);
        seg(sleeveAt, L, 2, (d, ny, r) => d > r - .5 ? G.K : ny < -.4 ? G.W : ny < .4 ? G.l : G.d);
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const d = Math.hypot(x, y); if (d <= 2.4) put(R[0] + x, R[1] + y, d > 1.4 ? G.K : y < 0 ? G.W : G.l, t); }
        for (let s = 0; s <= L - 2; s += .4) put(Math.round(R[0] + ux * s), Math.round(R[1] + uy * s), s > 1 && s < L - 3 ? G.h : G.l, t);
    };
    if (cords) { clasp(a, dir, 0); clasp(b, -dir, n - 1); }
    if (cords && !p.noCard && n >= MIN_FOR_CARD) {
        /* it hangs flat in the rope's plane, so it slants with it. Two plain ruled lines: two rows apart they'd lock into a checker on the slant. */
        const t = Math.floor(n / 2), slope = (b[1] - a[1]) / (b[0] - a[0]), midX = Math.round((a[0] + b[0]) / 2), left = midX - Math.floor(CARD_W / 2), cy = Math.round(yAt(midX)) + 1;
        const yOf = u => cy + Math.round((u - Math.floor(CARD_W / 2)) * slope);
        for (const u of [3, CARD_W - 4]) { const from = Math.round(yAt(left + u)) + 2, to = yOf(u) + CARD_DROP; for (let y = from; y < to; y++) put(left + u, y, CARD.str, t); }
        for (let u = 0; u < CARD_W; u++) for (let r = 0; r < CARD_H; r++) {
            const sideEdge = u === 0 || u === CARD_W - 1, endEdge = r === 0 || r === CARD_H - 1;
            if (sideEdge && endEdge) continue;
            put(left + u, yOf(u) + CARD_DROP + r, sideEdge || endEdge ? CARD.K : r === 1 ? CARD.top : CARD.face, t);
        }
        for (const r of [3, 6]) for (let u = 2; u <= 14; u++) put(left + u, yOf(u) + CARD_DROP + r, CARD.ink, t);
    }
    pole(b, n - 1);
    return { list, feet: [[a[0], a[1], 0], [b[0], b[1], n - 1]] };
}
const api = { pixels, MIN_FOR_CARD };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.RopeBarrier = api;
})();

} };
MODULES["iso3d.js"] = { dir: "/site/tools/hallway-editor/ideas", run: function (module, exports, require, __dirname) {
/* A small ray-caster for making new furniture in the hallway's own projection: 16 units to a tile, screen x = x - y, screen y = (x + y) / 2 - z.
   Every pixel looks along (1,1,1), so there are no gaps or wobbly edges, and a 1px outline and flat shading bands make it read like the client's art.
   A material is { top, x, y, nx, ny, edge, line } of colours (x is the face looking +x, the darker visible side; y the one looking +y, the lighter), or a function (face, p) => colour. */
"use strict";
const hex = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const col = c => typeof c === "string" ? hex(c.replace("#", "")) : c;
let nextId = 1;
const box = (x0, x1, y0, y1, z0, z1, mat, o = {}) => ({ kind: "box", x0, x1, y0, y1, z0, z1, mat, id: nextId++, ...o });
const cyl = (cx, cy, r, z0, z1, mat, o = {}) => ({ kind: "cyl", cx, cy, r, z0, z1, mat, id: nextId++, ...o });
const ball = (cx, cy, cz, r, mat, o = {}) => ({ kind: "ball", cx, cy, cz, r, mat, id: nextId++, ...o });
/* flat tones for a material from three colours, plus an outline */
const M = (top, y, x, edge = "1c1103", extra = {}) => ({ top: col(top), y: col(y), x: col(x), edge: col(edge), ...extra });

/* the last point along the ray still inside the primitive, seen from the camera: returns [t, face, local p] */
function hit(pr, ox, oy, oz) {
    if (pr.kind === "box") {
        let px = ox, py = oy, dx = 1, dy = 1;
        if (pr.rot) { const a = -pr.rot, c = Math.cos(a), s = Math.sin(a), rx = ox - pr.px, ry = oy - pr.py; px = pr.px + rx * c - ry * s; py = pr.py + rx * s + ry * c; dx = c - s; dy = s + c; }
        let tN = -1e9, tF = 1e9, face = null;
        const ax = (o, d, a, b, plus, minus) => { if (Math.abs(d) < 1e-9) { if (o < a || o > b) tN = 1e9; return; } const t1 = (a - o) / d, t2 = (b - o) / d, lo = Math.min(t1, t2), hi = Math.max(t1, t2); if (lo > tN) tN = lo; if (hi < tF) { tF = hi; face = t2 > t1 ? plus : minus; } };
        ax(px, dx, pr.x0, pr.x1, "x", "nx"); ax(py, dy, pr.y0, pr.y1, "y", "ny"); ax(oz, 1, pr.z0, pr.z1, "top", "bottom");
        if (tN > tF) return null;
        return [tF, face, [px + dx * tF, py + dy * tF, oz + tF]];
    }
    if (pr.kind === "cyl") {
        const fx = ox - pr.cx, fy = oy - pr.cy, a = 2, b = 2 * (fx + fy), c = fx * fx + fy * fy - pr.r * pr.r, D = b * b - 4 * a * c; if (D < 0) return null;
        const q = Math.sqrt(D), lo = (-b - q) / (2 * a), hi = (-b + q) / (2 * a), zl = pr.z0 - oz, zh = pr.z1 - oz, tN = Math.max(lo, zl), tF = Math.min(hi, zh); if (tN > tF) return null;
        const p = [ox + tF, oy + tF, oz + tF]; return [tF, tF === zh ? "top" : "side", p, [(p[0] - pr.cx) / pr.r, (p[1] - pr.cy) / pr.r, 0]];
    }
    const fx = ox - pr.cx, fy = oy - pr.cy, fz = oz - pr.cz, a = 3, b = 2 * (fx + fy + fz), c = fx * fx + fy * fy + fz * fz - pr.r * pr.r, D = b * b - 4 * a * c; if (D < 0) return null;
    const t = (-b + Math.sqrt(D)) / (2 * a), p = [ox + t, oy + t, oz + t]; return [t, "side", p, [(p[0] - pr.cx) / pr.r, (p[1] - pr.cy) / pr.r, (p[2] - pr.cz) / pr.r]];
}
/* round things: flat bands by the light, which falls from the upper left */
function bands(mat, n) {
    const L = [-.35, .62, .7], l = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const r = mat.ramp; const i = Math.max(0, Math.min(r.length - 1, Math.floor((l + .35) / 1.35 * r.length))); return col(r[i]);
}
/* the extents of a scene on screen */
function bounds(prims) {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    const add = (x, y, z) => { const sx = x - y, sy = (x + y) / 2 - z; a = Math.min(a, sx); b = Math.max(b, sx); c = Math.min(c, sy); d = Math.max(d, sy); };
    for (const p of prims) {
        if (p.kind === "box") { const R = p.rot ? Math.hypot(Math.max(Math.abs(p.x0 - p.px), Math.abs(p.x1 - p.px)), Math.max(Math.abs(p.y0 - p.py), Math.abs(p.y1 - p.py))) : 0; const xs = p.rot ? [p.px - R, p.px + R] : [p.x0, p.x1], ys = p.rot ? [p.py - R, p.py + R] : [p.y0, p.y1]; for (const x of xs) for (const y of ys) for (const z of [p.z0, p.z1]) add(x, y, z); }
        else if (p.kind === "cyl") for (const s of [-1, 1]) for (const u of [-1, 1]) for (const z of [p.z0, p.z1]) add(p.cx + s * p.r, p.cy + u * p.r, z);
        else for (const s of [-1, 1]) for (const u of [-1, 1]) for (const v of [-1, 1]) add(p.cx + s * p.r, p.cy + u * p.r, p.cz + v * p.r);
    }
    return { x0: Math.floor(a) - 2, x1: Math.ceil(b) + 2, y0: Math.floor(c) - 2, y1: Math.ceil(d) + 2 };
}
/* opt.wall = { at, inside(y, z) }: a wall in the plane x=at. Anything behind it only shows through where inside() says so.
   opt.wallY = { at, inside(x, z) }: the same for a wall in the plane y=at. */
function render(prims, opt = {}) {
    const B = opt.bounds || bounds(prims), w = B.x1 - B.x0, h = B.y1 - B.y0, rgba = new Uint8ClampedArray(w * h * 4), ids = new Int32Array(w * h), depth = new Float32Array(w * h), edge = new Array(w * h), lines = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const sx = i + B.x0 + .5, sy = j + B.y0 + .5, ox = sy + sx / 2, oy = sy - sx / 2, oz = 0;
        let best = null, bp = null;
        for (const pr of prims) { const r = hit(pr, ox, oy, oz); if (r && (!best || r[0] > best[0])) { best = r; bp = pr; } }
        const W = opt.wall, Wy = opt.wallY;
        if (W) { const t = W.at - ox; if ((!best || best[0] < t + 1e-6) && !W.inside(oy + t, oz + t)) continue; }
        if (Wy) { const t = Wy.at - oy; if ((!best || best[0] < t + 1e-6) && !Wy.inside(ox + t, oz + t)) continue; }
        if (!best) continue;
        const m = bp.mat, p = best[2]; let c = typeof m === "function" ? m(best[1], p, best[3]) : (best[1] === "top" && m.top) ? m.top : (best[3] && m.ramp) ? bands(m, best[3]) : (m[best[1]] || m.x);
        if (typeof c === "function") c = c(best[1], p, best[3]);
        if (m.tex) { const t = m.tex(best[1], p); if (t) c = col(t); }
        if (!c) continue; c = col(c); if (opt.light) c = opt.light(c, p);
        depth[j * w + i] = best[0]; const q = (j * w + i) * 4; rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255; ids[j * w + i] = bp.id + (bp.creases ? ({ top: 0, x: 1000000, y: 2000000, nx: 3000000, ny: 4000000 }[best[1]] || 0) : 0); edge[j * w + i] = m.edge || null; lines[j * w + i] = m.noLine ? 0 : 1;
    }
    /* the outline: the last pixel of an object against anything further away or empty */
    const out = new Uint8ClampedArray(rgba);
    const lum = (i) => i;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const a = j * w + i; if (!ids[a]) continue;
        const open = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !ids[y * w + x];
        const q = a * 4, e = edge[a];
        if (e && (open(i - 1, j) || open(i + 1, j) || open(i, j - 1) || open(i, j + 1))) { out[q] = e[0]; out[q + 1] = e[1]; out[q + 2] = e[2]; continue; }
        if (e && opt.depthEdge) { let hit2 = false; for (const [x, y] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (x < 0 || y < 0 || x >= w || y >= h) continue; if (depth[j * w + i] - depth[y * w + x] > 1.6) { hit2 = true; break; } } if (hit2) { out[q] = e[0]; out[q + 1] = e[1]; out[q + 2] = e[2]; continue; } }
        /* a darker line where one part meets another, on the far side only */
        if (opt.crease !== false && lines[a]) for (const [x, y] of [[i + 1, j], [i, j + 1]]) { if (x < w && y < h && ids[y * w + x] && ids[y * w + x] !== ids[a]) { const nb = (y * w + x) * 4; if (rgba[q] + rgba[q + 1] + rgba[q + 2] >= rgba[nb] + rgba[nb + 1] + rgba[nb + 2] - 8) { out[q] *= .62; out[q + 1] *= .62; out[q + 2] *= .62; break; } } }
    }
    return { w, h, ox: -B.x0, oy: -B.y0, rgba: out };
}
module.exports = { box, cyl, ball, M, render, bounds, col, hex };

} };
MODULES["hall-window.js"] = { dir: "/site/tools/hallway-editor/render", run: function (module, exports, require, __dirname) {
/* A window in the wall: frame in the wall's own wood, a clean board along the bottom, dark inner frame, glazing bars. Any width, bottom and top.
   Drawn once per size with the same small ray-caster the other new pieces were made with, and shared by the drawing and nothing else.
   Its art is for a wall running along y; hw3.js mirrors it for the other. */
"use strict";
const iso = require("../ideas/iso3d.js"), { box, M, render, col } = iso;
const groove = (face, p) => { if (face === "x") return Math.floor(p[1] + 400) % 6 === 0 ? "34180b" : Math.floor(p[1] + 400) % 6 === 3 ? "593422" : "452313"; if (face === "y") return Math.floor(p[0] + 400) % 6 === 0 ? "452313" : "593422"; return null; };
const cache = new Map();
function barsOf(W) { return Math.max(1, Math.round(W / 26)); }
function railsOf(b, top) { return top - b > 90 ? [b + (top - b) * .33, b + (top - b) * .66] : [b + (top - b) * .55]; }
function art(W, bottom, top) {
    const key = W + "," + bottom + "," + top; if (cache.has(key)) return cache.get(key);
    const FR = { top: col("93705a"), y: col("593422"), x: col("452313"), ny: col("34180b"), nx: col("34180b"), edge: col("120704") }, DK = M("593422", "452313", "34180b", "120704"), RL = { top: col("93705a"), y: col("765444"), x: col("5f3f2e"), edge: col("120704") };
    const ps = [], Hh = top, b = bottom, bars = barsOf(W);
    ps.push(box(-10, 0, -3, 0, b, Hh, { ...FR, y: col("593422") }));
    if (b) ps.push(box(-10, 6, -5, W + 5, b - 3, b + 1, RL)); else ps.push(box(-10, 4, -4, W + 4, 0, 3, RL));
    const y0 = b ? b + 1 : 3;
    ps.push(box(0, 3.5, -4, 1, y0, Hh + 3, { ...FR, tex: groove }), box(0, 3.5, W - 1, W + 4, y0, Hh + 3, { ...FR, tex: groove }));
    ps.push(box(0, 5, -5, W + 5, Hh, Hh + 4, RL));
    ps.push(box(-3, -1, 1, 2, y0, Hh, DK), box(-3, -1, W - 2, W - 1, y0, Hh, DK), box(-3, -1, 1, W - 1, Hh - 2, Hh, DK), box(-3, -1, 1, W - 1, y0, y0 + 2, DK));
    for (let i = 1; i <= bars; i++) { const y = W * i / (bars + 1); ps.push(box(-5, -3, y - 1, y + 1, y0, Hh, FR)); }
    for (const z of railsOf(b, Hh)) ps.push(box(-5, -3, 1, W - 1, z - 1, z + 1, FR));
    const s = render(ps, { wall: { at: 0, inside: (y, z) => y > 0 && y < W && z >= y0 && z < Hh } });
    if (cache.size > 60) cache.clear(); cache.set(key, s); return s;
}
/* the sun comes in at this slant, and through the panes only */
const SUN = [1, .34, -.92];
function litByWindow(W, b, top, wy, wz) { if (wy < 1 || wy > W - 1 || wz < b + 2 || wz > top - 2) return false; const bars = barsOf(W); for (let i = 1; i <= bars; i++) if (Math.abs(wy - W * i / (bars + 1)) < 1.3) return false; for (const z of railsOf(b, top)) if (Math.abs(wz - z) < 1.3) return false; return true; }
/* which part of the grounds each window looks on: centres in the hotel view's picture */
const PLACES = { lawn: [640, 350], road: [480, 400], maze: [560, 430], park: [340, 320] };
module.exports = { art, SUN, litByWindow, PLACES };

} };
MODULES["furni-parts.js"] = { dir: "/site/tools/hallway-editor", run: function (module, exports, require, __dirname) {
/* What each piece of hallway furniture is made of, shared by the drawing (render/hw3.js) and the
   editor (ghosts, selecting, walking), so the two can't disagree.

   A placed piece is { k, x, y, len?, rot? }.
   len: how many tiles long a sofa, table or planter is. The client cuts these into an end, repeatable
        middles and another end, so they can be any length.
   rot: quarter turns. The client only draws each piece from one or two sides and mirrors it for the
        others, as the game does, so most pieces have two ways round and chairs have four. */
"use strict";
(function (root) {
    const ROWS = {
        sofa: {
            def: 2, min: 2, flip: true,
            part: (i, n) => i === 0 ? ["hw_sofa1_a_0_2_0"] : i === n - 1 ? ["hw_sofa3_a_0_2_0", "hw_sofa3_b_0_2_0"] : ["hw_sofa2_a_0_2_0"]
        },
        table: {
            def: 3, min: 2, flip: false,
            part: (i, n) => i === 0 ? ["hw_table1_a_0_0_0"] : i === n - 1 ? ["hw_table3_a_0_0_0"] : ["hw_table2_a_0_0_0"]
        },
        ero: {
            def: 2, min: 2, flip: false,
            part: (i, n) => i === 0 ? ["hw_ero1_a_0_0_0"] : i === n - 1 ? ["hw_ero5_a_0_0_0"] : ["hw_ero" + (2 + (i - 1) % 3) + "_a_0_0_0"]
        }
    };
    /* the same planter in other materials: see make-planters.js */
    for (const v of ["stone", "walnut", "evergreen", "flower"]) ROWS["ero_" + v] = { def: 2, min: 2, flip: false, part: (i, n) => ["hwv_" + v + (i === 0 ? 1 : i === n - 1 ? 5 : 2 + (i - 1) % 3) + "_a_0_0_0"] };
    /* drawn by render/rope-barrier.js, not from the client's sprites */
    ROWS.rope = { def: 3, min: 2, flip: false, part: () => [] };
    /* one piece of art lying across three tiles: it doesn't stretch */
    ROWS.trophy = { def: 3, min: 3, max: 3, flip: false, part: () => [] };
    const SINGLES = {
        plant: ["hw_plant_a_0_0_0"], statue: ["hw_statue_a_0_0_0"], fountain: ["hw_fountain_a_0_0_0"],
        rarecase: [], xmastree: [], xmaslantern: [], xmassmalltree: [], xmasdrinks: [], xmasduck: [], snowman: [], gift1: [], gift2: [], gift3: [], gift4: [], mark_scuff: [], mark_tile: [], shelf: ["hw_shelf_a_0_4_0"], cabinet: ["hw_closet1_a_0_2_0"], water: ["hw_watermatic_a_0_4_0"],
        pillar: ["pillar1_a_0_0_0"], pillartall: ["pillar1_a_0_0_0"], smtable: ["hw_smtble_a_0_0_0"], ballpost: ["pillar0_a_0_0_0"]
    };
    const FLIPPED = { cabinet: true };
    const CHAIR = [[2, false], [2, true], [0, true], [0, false]];          // clockwise: the client's side, and its mirror

    const turns = k => k === "chair" ? 4 : (k === "mark_scuff" || k === "mark_tile" || k === "lamp" || k === "pillar" || k === "pillartall" || k === "smtable" || k === "ballpost") ? 1 : 2;
    const rotOf = p => { const t = turns(p.k); return (((p.rot || 0) % t) + t) % t; };
    const lengthOf = p => { const r = ROWS[p.k]; return r ? (r.max ? r.max : Math.max(r.min, p.len || r.def)) : 1; };

    /* the sprites, tile by tile, in drawing order. Mirroring a row about its first tile turns a run
       along x into a run along y, so the pieces still meet. */
    function parts(p) {
        const r = ROWS[p.k], rot = rotOf(p);
        if (r) {
            const n = lengthOf(p), out = [];
            for (let i = 0; i < n; i++) out.push({ names: r.part(i, n), x: rot ? p.x : p.x + i, y: rot ? p.y + i : p.y, flip: rot ? !r.flip : r.flip });
            return out;
        }
        if (p.k === "chair") {
            const [d, flip] = CHAIR[rot];
            return [{ names: ["hw_chair_a_0_" + d + "_0", "hw_chair_b_0_" + d + "_0"], x: p.x, y: p.y, flip }];
        }
        const s = SINGLES[p.k]; if (!s) return [];
        return [{ names: s, x: p.x, y: p.y, flip: rot ? !FLIPPED[p.k] : !!FLIPPED[p.k] }];
    }
    /* the tiles it stands on */
    function tiles(p) {
        if (ROWS[p.k]) return parts(p).map(q => [q.x, q.y]);
        if (p.k === "fountain" || p.k === "statue") return [[p.x, p.y], [p.x + 1, p.y], [p.x, p.y + 1], [p.x + 1, p.y + 1]];
        return [[p.x, p.y]];
    }
    /* A maze's name for its door: the archive's with its glyphs and decoration off ("*ÕMaze EmpireÕ*" is Maze Empire's door), as render/hw.js's clean() has it */
    const mazeName = n => String(n || "").replace(/[^\x20-\x7e]/g, "").replace(/\*/g, "").replace(/\[|\]/g, "").trim().replace(/\s+/g, " ");
    const api = { ROWS, parts, tiles, turns, rotOf, lengthOf, mazeName };
    /* the squares of the picture a floor below ground can be seen in, so the failing lights only draw those */
    api.xmasTiles = (map, size = 512) => { const out = new Set(), add = (x, y, l, r, u, d) => { for (let ty = Math.floor((y - u) / size); ty <= Math.floor((y + d) / size); ty++) for (let tx = Math.floor((x - l) / size); tx <= Math.floor((x + r) / size); tx++) out.add(tx + "," + ty); }, S = (x, y, z) => [(x - y) * 16, (x + y) * 8 - z];
        for (const l of map.levels) { const z = l.k * 163; for (const p of l.props || []) if (/^(xmas|gift\d|snowman)/.test(p.k)) { const q = S(p.x + .5, p.y + .5, z); add(q[0], q[1], 110, 110, 160, 70); } for (const q of l.wallItems || []) if (/^i_(garland|window|bunting|festoon|wreath|stockings|holly|canes)/.test(q.k)) { const a = q.axis === "y" ? S(q.line, q.at, z) : S(q.at, q.line, z); add(a[0], a[1], 120, 120, 200, 60); } }
        return out; };
    api.basementTiles = (map, size = 512) => { const out = new Set(); for (const l of map.levels) { if (l.k >= 0) continue; const z = l.k * 163; for (const c of l.cells || []) { const [cx, cy] = c.split(",").map(Number), x = (cx - cy) * 32, y = (cx + cy) * 16 - z; for (let ty = Math.floor((y - 200) / size); ty <= Math.floor((y + 40) / size); ty++) for (let tx = Math.floor((x - 40) / size); tx <= Math.floor((x + 40) / size); tx++) out.add(tx + "," + ty); } } return out; };
    if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FurniParts = api;
})(typeof window !== "undefined" ? window : globalThis);

} };
MODULES["wall-items.js"] = { dir: "/site/tools/hallway-editor", run: function (module, exports, require, __dirname) {
/* made by make-wall-items.js and make-ideas-art.js */
(function () { const L = [{"id":"h_painting1","name":"Stormy seas","kind":"painting","x":{"w":58,"h":60,"layers":[{"f":"h_painting1.png","x":-29,"y":-30,"flip":0}]},"y":{"w":58,"h":60,"layers":[{"f":"h_painting1.png","x":-29,"y":-30,"flip":1}]}},{"id":"h_painting2","name":"Glass panel","kind":"painting","x":{"w":48,"h":62,"layers":[{"f":"h_painting2.png","x":-24,"y":-31,"flip":0}]},"y":{"w":48,"h":62,"layers":[{"f":"h_painting2.png","x":-24,"y":-31,"flip":1}]}},{"id":"h_pntg","name":"Little gilt frames","kind":"painting","x":{"w":58,"h":44,"layers":[{"f":"h_pntg.png","x":-29,"y":-22,"flip":0}]},"y":{"w":58,"h":44,"layers":[{"f":"h_pntg.png","x":-29,"y":-22,"flip":1}]}},{"id":"p_calm_seas","name":"Calm seas at sunset","kind":"custom","x":{"w":56,"h":67,"layers":[{"f":"p_calm_seas.png","x":-28,"y":-33,"flip":0}]},"y":{"w":56,"h":67,"layers":[{"f":"p_calm_seas.png","x":-28,"y":-33,"flip":1}]}},{"id":"p_moonlit_maze","name":"Moonlit maze","kind":"custom","x":{"w":56,"h":67,"layers":[{"f":"p_moonlit_maze.png","x":-28,"y":-33,"flip":0}]},"y":{"w":56,"h":67,"layers":[{"f":"p_moonlit_maze.png","x":-28,"y":-33,"flip":1}]}},{"id":"p_gentleman_rat","name":"The founder","kind":"custom","x":{"w":38,"h":66,"layers":[{"f":"p_gentleman_rat.png","x":-19,"y":-33,"flip":0}]},"y":{"w":38,"h":66,"layers":[{"f":"p_gentleman_rat.png","x":-19,"y":-33,"flip":1}]}},{"id":"p_golden_key","name":"The golden key","kind":"custom","x":{"w":36,"h":63,"layers":[{"f":"p_golden_key.png","x":-18,"y":-31,"flip":0}]},"y":{"w":36,"h":63,"layers":[{"f":"p_golden_key.png","x":-18,"y":-31,"flip":1}]}},{"id":"p_maze_plan","name":"Plan of the maze","kind":"custom","x":{"w":44,"h":59,"layers":[{"f":"p_maze_plan.png","x":-22,"y":-29,"flip":0}]},"y":{"w":44,"h":59,"layers":[{"f":"p_maze_plan.png","x":-22,"y":-29,"flip":1}]}},{"id":"p_autumn_wood","name":"Autumn wood","kind":"custom","x":{"w":36,"h":47,"layers":[{"f":"p_autumn_wood.png","x":-18,"y":-23,"flip":0}]},"y":{"w":36,"h":47,"layers":[{"f":"p_autumn_wood.png","x":-18,"y":-23,"flip":1}]}},{"id":"p_still_life","name":"Flowers in a blue jug","kind":"custom","x":{"w":28,"h":49,"layers":[{"f":"p_still_life.png","x":-14,"y":-24,"flip":0}]},"y":{"w":28,"h":49,"layers":[{"f":"p_still_life.png","x":-14,"y":-24,"flip":1}]}},{"id":"p_old_mountains","name":"Mountains at dawn","kind":"custom","x":{"w":50,"h":58,"layers":[{"f":"p_old_mountains.png","x":-25,"y":-29,"flip":0}]},"y":{"w":50,"h":58,"layers":[{"f":"p_old_mountains.png","x":-25,"y":-29,"flip":1}]}},{"id":"p_gilt_trio","name":"Little gilt pictures","kind":"custom","x":{"w":58,"h":44,"layers":[{"f":"p_gilt_trio.png","x":-29,"y":-22,"flip":0}]},"y":{"w":58,"h":44,"layers":[{"f":"p_gilt_trio.png","x":-29,"y":-22,"flip":1}]}},{"id":"i_peel_small","name":"Torn paper: small corner","kind":"tell","tell":true,"h":64,"x":{"w":17,"h":20,"layers":[{"f":"i_peel_small.png","x":-8,"y":-8,"flip":1}]},"y":{"w":17,"h":20,"layers":[{"f":"i_peel_small.png","x":-8,"y":-8,"flip":0}]}},{"id":"i_peel_corner","name":"Torn paper: bigger corner","kind":"tell","tell":true,"h":96,"x":{"w":34,"h":47,"layers":[{"f":"i_peel_corner.png","x":-17,"y":-21,"flip":1}]},"y":{"w":34,"h":47,"layers":[{"f":"i_peel_corner.png","x":-17,"y":-21,"flip":0}]}},{"id":"i_peel_strip","name":"Torn paper: hanging strip","kind":"tell","tell":true,"h":108,"x":{"w":38,"h":68,"layers":[{"f":"i_peel_strip.png","x":-19,"y":-32,"flip":1}]},"y":{"w":38,"h":68,"layers":[{"f":"i_peel_strip.png","x":-19,"y":-32,"flip":0}]}},{"id":"i_peel_patch","name":"Torn paper: ripped patch","kind":"tell","tell":true,"h":80,"x":{"w":51,"h":67,"layers":[{"f":"i_peel_patch.png","x":-25,"y":-34,"flip":1}]},"y":{"w":51,"h":67,"layers":[{"f":"i_peel_patch.png","x":-25,"y":-34,"flip":0}]}},{"id":"i_ghost_tall","name":"Picture mark: tall","kind":"tell","tell":true,"h":76,"x":{"w":26,"h":47,"layers":[{"f":"i_ghost_tall.png","x":-13,"y":-24,"flip":1}]},"y":{"w":26,"h":47,"layers":[{"f":"i_ghost_tall.png","x":-13,"y":-24,"flip":0}]}},{"id":"i_ghost_oval","name":"Picture mark: oval","kind":"tell","tell":true,"h":76,"x":{"w":24,"h":40,"layers":[{"f":"i_ghost_oval.png","x":-12,"y":-20,"flip":1}]},"y":{"w":24,"h":40,"layers":[{"f":"i_ghost_oval.png","x":-12,"y":-20,"flip":0}]}},{"id":"i_ghost_wide","name":"Picture mark: wide","kind":"tell","tell":true,"h":76,"x":{"w":54,"h":52,"layers":[{"f":"i_ghost_wide.png","x":-27,"y":-26,"flip":1}]},"y":{"w":54,"h":52,"layers":[{"f":"i_ghost_wide.png","x":-27,"y":-26,"flip":0}]}},{"id":"i_ghost_row","name":"Picture marks: three","kind":"tell","tell":true,"h":80,"x":{"w":54,"h":48,"layers":[{"f":"i_ghost_row.png","x":-27,"y":-22,"flip":1}]},"y":{"w":54,"h":48,"layers":[{"f":"i_ghost_row.png","x":-27,"y":-22,"flip":0}]}},{"id":"i_damp","name":"Damp from the cornice","kind":"tell","tell":true,"h":124,"x":{"w":72,"h":88,"layers":[{"f":"i_damp.png","x":-36,"y":-45,"flip":1}]},"y":{"w":72,"h":88,"layers":[{"f":"i_damp.png","x":-36,"y":-45,"flip":0}]}},{"id":"i_damp_run","name":"Damp: one long run","kind":"tell","tell":true,"h":120,"x":{"w":38,"h":84,"layers":[{"f":"i_damp_run.png","x":-19,"y":-40,"flip":1}]},"y":{"w":38,"h":84,"layers":[{"f":"i_damp_run.png","x":-19,"y":-40,"flip":0}]}},{"id":"i_chip1","name":"Chewed rail: a nibble","kind":"tell","tell":true,"h":40,"x":{"w":7,"h":6,"layers":[{"f":"i_chip1.png","x":-3,"y":-4,"flip":1}]},"y":{"w":7,"h":6,"layers":[{"f":"i_chip1.png","x":-3,"y":-4,"flip":0}]},"locked":true},{"id":"i_chip2","name":"Chewed rail: two nibbles","kind":"tell","tell":true,"h":40,"x":{"w":19,"h":12,"layers":[{"f":"i_chip2.png","x":-9,"y":-7,"flip":1}]},"y":{"w":19,"h":12,"layers":[{"f":"i_chip2.png","x":-9,"y":-7,"flip":0}]},"locked":true},{"id":"i_chip3","name":"Chewed rail: a chunk","kind":"tell","tell":true,"h":40,"x":{"w":16,"h":11,"layers":[{"f":"i_chip3.png","x":-8,"y":-6,"flip":1}]},"y":{"w":16,"h":11,"layers":[{"f":"i_chip3.png","x":-8,"y":-6,"flip":0}]},"locked":true},{"id":"i_crack","name":"Crack","kind":"tell","tell":true,"h":80,"x":{"w":27,"h":53,"layers":[{"f":"i_crack.png","x":-13,"y":-24,"flip":1}]},"y":{"w":27,"h":53,"layers":[{"f":"i_crack.png","x":-13,"y":-24,"flip":0}]}},{"id":"i_crack2","name":"Forking crack","kind":"tell","tell":true,"h":72,"x":{"w":19,"h":41,"layers":[{"f":"i_crack2.png","x":-9,"y":-20,"flip":1}]},"y":{"w":19,"h":41,"layers":[{"f":"i_crack2.png","x":-9,"y":-20,"flip":0}]}},{"id":"i_panel","name":"Loose dado panel","kind":"tell","tell":true,"h":24,"x":{"w":16,"h":42,"layers":[{"f":"i_panel.png","x":-8,"y":-22,"flip":1}]},"y":{"w":16,"h":42,"layers":[{"f":"i_panel.png","x":-8,"y":-22,"flip":0}]},"locked":true},{"id":"i_theatre","name":"Way to the Theatredrome","kind":"hotel","tell":true,"h":84,"x":{"w":100,"h":92,"layers":[{"f":"i_theatre_m.png","x":-50,"y":-45,"flip":1}]},"y":{"w":100,"h":92,"layers":[{"f":"i_theatre.png","x":-50,"y":-45,"flip":0}]}},{"id":"i_bar","name":"The Dirty Duck","kind":"hotel","tell":true,"h":84,"x":{"w":107,"h":95,"layers":[{"f":"i_bar_m.png","x":-53,"y":-47,"flip":1}]},"y":{"w":107,"h":95,"layers":[{"f":"i_bar.png","x":-53,"y":-47,"flip":0}]}},{"id":"i_guides","name":"Hotel Guides","kind":"hotel","tell":true,"h":84,"x":{"w":104,"h":94,"layers":[{"f":"i_guides_m.png","x":-52,"y":-46,"flip":1}]},"y":{"w":104,"h":94,"layers":[{"f":"i_guides.png","x":-52,"y":-46,"flip":0}]}},{"id":"i_poster","name":"Poster: beware","kind":"hotel","tell":true,"h":84,"x":{"w":85,"h":96,"layers":[{"f":"i_poster_m.png","x":-42,"y":-46,"flip":1}]},"y":{"w":85,"h":96,"layers":[{"f":"i_poster.png","x":-42,"y":-46,"flip":0}]}},{"id":"i_photo","name":"A photo of the hotel (.com)","kind":"hotel","tell":true,"h":84,"x":{"w":61,"h":102,"layers":[{"f":"i_photo.png","x":-30,"y":-50,"flip":1}]},"y":{"w":61,"h":102,"layers":[{"f":"i_photo.png","x":-30,"y":-50,"flip":0}]}},{"id":"i_photo_es","name":"A photo of the hotel (.es)","kind":"hotel","tell":true,"h":84,"x":{"w":61,"h":102,"layers":[{"f":"i_photo_es.png","x":-30,"y":-50,"flip":1}]},"y":{"w":61,"h":102,"layers":[{"f":"i_photo_es.png","x":-30,"y":-50,"flip":0}]}},{"id":"i_photo_br","name":"A photo of the hotel (.com.br)","kind":"hotel","tell":true,"h":84,"x":{"w":61,"h":102,"layers":[{"f":"i_photo_br.png","x":-30,"y":-50,"flip":1}]},"y":{"w":61,"h":102,"layers":[{"f":"i_photo_br.png","x":-30,"y":-50,"flip":0}]}},{"id":"i_freedoor","name":"Free Credits, bricked up","kind":"hotel","tell":true,"h":40,"x":{"w":69,"h":103,"layers":[{"f":"i_freedoor_m.png","x":-34,"y":-44,"flip":1}]},"y":{"w":69,"h":103,"layers":[{"f":"i_freedoor.png","x":-34,"y":-44,"flip":0}]},"locked":true},{"id":"i_fireexit","name":"Fire exit","kind":"hotel","tell":true,"h":48,"x":{"w":39,"h":103,"layers":[{"f":"i_fireexit_m.png","x":-19,"y":-44,"flip":1,"litF":"i_fireexit_lit_m.png"}]},"y":{"w":39,"h":103,"layers":[{"f":"i_fireexit.png","x":-19,"y":-44,"flip":0,"litF":"i_fireexit_lit.png"}]},"lit":{"colour":"#2ee07c","at":[4,16.5,78.5]},"locked":true},{"id":"i_ratcase","name":"A stuffed rat, in a case","kind":"hotel","tell":true,"h":80,"x":{"w":50,"h":55,"layers":[{"f":"i_ratcase.png","x":-25,"y":-27,"flip":1}]},"y":{"w":50,"h":55,"layers":[{"f":"i_ratcase.png","x":-25,"y":-27,"flip":0}]}},{"id":"i_window","name":"Window","kind":"window","tell":true,"h":64,"x":{"w":60,"h":159,"layers":[{"f":"i_window.png","x":-28,"y":-87,"flip":1}]},"y":{"w":60,"h":159,"layers":[{"f":"i_window.png","x":-32,"y":-87,"flip":0}]}},{"id":"i_bunting","name":"Christmas bunting","kind":"xmas","tell":true,"h":112,"x":{"w":97,"h":62,"layers":[{"f":"i_bunting.png","x":-48,"y":-31,"flip":1}]},"y":{"w":97,"h":62,"layers":[{"f":"i_bunting.png","x":-48,"y":-31,"flip":0}]},"xmas":true},{"id":"i_festoon","name":"Festoon lights","kind":"xmas","tell":true,"h":120,"x":{"w":97,"h":59,"layers":[{"f":"i_festoon.png","x":-48,"y":-27,"flip":1,"litF":"i_festoon_lit.png"}]},"y":{"w":97,"h":59,"layers":[{"f":"i_festoon.png","x":-48,"y":-27,"flip":0,"litF":"i_festoon_lit.png"}]},"lit":{"colour":"#ffcf80","at":[0,48,112]},"xmas":true},{"id":"i_wreath","name":"Wreath","kind":"xmas","tell":true,"h":92,"x":{"w":29,"h":44,"layers":[{"f":"i_wreath.png","x":-14,"y":-22,"flip":1}]},"y":{"w":29,"h":44,"layers":[{"f":"i_wreath.png","x":-14,"y":-22,"flip":0}]},"xmas":true},{"id":"i_stockings","name":"Stockings","kind":"xmas","tell":true,"h":88,"x":{"w":48,"h":48,"layers":[{"f":"i_stockings.png","x":-24,"y":-24,"flip":1}]},"y":{"w":48,"h":48,"layers":[{"f":"i_stockings.png","x":-24,"y":-24,"flip":0}]},"xmas":true},{"id":"i_holly","name":"Holly swag","kind":"xmas","tell":true,"h":120,"x":{"w":71,"h":43,"layers":[{"f":"i_holly.png","x":-35,"y":-20,"flip":1}]},"y":{"w":71,"h":43,"layers":[{"f":"i_holly.png","x":-35,"y":-20,"flip":0}]},"xmas":true},{"id":"i_canes","name":"Candy canes","kind":"xmas","tell":true,"h":96,"x":{"w":31,"h":42,"layers":[{"f":"i_canes.png","x":-15,"y":-20,"flip":1}]},"y":{"w":31,"h":42,"layers":[{"f":"i_canes.png","x":-15,"y":-20,"flip":0}]},"xmas":true},{"id":"i_garland","name":"Christmas garland","kind":"xmas","tell":true,"h":96,"x":{"w":156,"h":85,"layers":[{"f":"i_garland.png","x":-78,"y":-40,"flip":1}]},"y":{"w":156,"h":85,"layers":[{"f":"i_garland.png","x":-78,"y":-40,"flip":0}]},"ax":151,"ay":94,"xmas":true,"spots":[[146,12],[133,18],[120,25],[107,31],[94,38],[81,44],[68,51],[55,57],[42,64],[29,70],[16,77],[3,83]]},{"id":"i_desk","name":"Lost Property desk","kind":"hotel","tell":true,"h":56,"x":{"w":117,"h":160,"layers":[{"f":"i_desk.png","x":-58,"y":-74,"flip":1}]},"y":{"w":117,"h":160,"layers":[{"f":"i_desk.png","x":-58,"y":-74,"flip":0}]},"locked":true,"snapAt":2.875},{"id":"i_lpsign","name":"Lost Property sign","kind":"hotel","tell":true,"h":100,"x":{"w":75,"h":82,"layers":[{"f":"i_lpsign_m.png","x":-72,"y":-112,"flip":1}]},"y":{"w":75,"h":82,"layers":[{"f":"i_lpsign.png","x":-2,"y":-112,"flip":0}]},"out":2},{"id":"i_board","name":"Notice board","kind":"hotel","tell":true,"h":76,"x":{"w":43,"h":54,"layers":[{"f":"i_board.png","x":-21,"y":-28,"flip":1}]},"y":{"w":43,"h":54,"layers":[{"f":"i_board.png","x":-21,"y":-28,"flip":0}]}},{"id":"i_rathole","name":"Rat hole","kind":"tell","tell":true,"h":12,"x":{"w":11,"h":14,"layers":[{"f":"i_rathole.png","x":-5,"y":1,"flip":1}]},"y":{"w":11,"h":14,"layers":[{"f":"i_rathole.png","x":-5,"y":1,"flip":0}]},"locked":true}], F = {"rarecase":{"f":"i_rarecase.png","ox":28,"oy":59,"w":56,"h":85,"opts":{"CF_10_coin_gold":{"f":"i_rc_CF_10_coin_gold.png","name":"Golden Habloon"},"CF_1_coin_bronze":{"f":"i_rc_CF_1_coin_bronze.png","name":"Bronze Habloon"},"CF_5_coin_silver":{"f":"i_rc_CF_5_coin_silver.png","name":"Silver Habloon"},"balloon_air":{"f":"i_rc_balloon_air.png","name":""},"balloon_scraps":{"f":"i_rc_balloon_scraps.png","name":""},"balloon_skin":{"f":"i_rc_balloon_skin.png","name":""},"build_prize1":{"f":"i_rc_build_prize1.png","name":"Gold Hammer Trophy"},"build_prize2":{"f":"i_rc_build_prize2.png","name":"Silver Hammer Trophy"},"build_prize3":{"f":"i_rc_build_prize3.png","name":"Bronze Hammer Trophy"},"capsule_bronze":{"f":"i_rc_capsule_bronze.png","name":"Prototype Capsule (Bronze)"},"capsule_silver":{"f":"i_rc_capsule_silver.png","name":"Prototype Capsule (Silver)"},"dark_deepgrove_cyclops":{"f":"i_rc_dark_deepgrove_cyclops.png","name":""},"dark_deepgrove_duck":{"f":"i_rc_dark_deepgrove_duck.png","name":""},"dark_deepgrove_mushroom_pot":{"f":"i_rc_dark_deepgrove_mushroom_pot.png","name":"Dark Potted Mushroom"},"dark_floordimmer":{"f":"i_rc_dark_floordimmer.png","name":"Launch Day Floor Mood Light"},"davehologram":{"f":"i_rc_davehologram.png","name":"Holodave"},"deadduck":{"f":"i_rc_deadduck.png","name":"Dead Duck"},"deadduck2":{"f":"i_rc_deadduck2.png","name":"Dead Duck 2"},"deadduck3":{"f":"i_rc_deadduck3.png","name":"Dead Duck 3"},"deepgrove_cyclops":{"f":"i_rc_deepgrove_cyclops.png","name":""},"deepgrove_duck":{"f":"i_rc_deepgrove_duck.png","name":""},"deepgrove_mushroom_pot":{"f":"i_rc_deepgrove_mushroom_pot.png","name":"Potted Mushroom"},"divider_silo1":{"f":"i_rc_divider_silo1.png","name":"Corner Shelf"},"drinks":{"f":"i_rc_drinks.png","name":"Empty Cans"},"duck":{"f":"i_rc_duck.png","name":"Rubber Duck"},"duck_devil":{"f":"i_rc_duck_devil.png","name":"Devil Duck"},"duck_pirate_blk":{"f":"i_rc_duck_pirate_blk.png","name":"Black Pirate Duck"},"duck_pirate_blu":{"f":"i_rc_duck_pirate_blu.png","name":"Blue Pirate Duck"},"duck_pirate_grn":{"f":"i_rc_duck_pirate_grn.png","name":"Green Pirate Duck"},"duck_pirate_purp":{"f":"i_rc_duck_pirate_purp.png","name":"Purple Pirate Duck"},"duck_pirate_red":{"f":"i_rc_duck_pirate_red.png","name":"Red Pirate Duck"},"duck_straw":{"f":"i_rc_duck_straw.png","name":""},"duck_witch":{"f":"i_rc_duck_witch.png","name":"Mage Duck"},"earthen_deepgrove_cyclops":{"f":"i_rc_earthen_deepgrove_cyclops.png","name":""},"earthen_deepgrove_duck":{"f":"i_rc_earthen_deepgrove_duck.png","name":""},"earthen_deepgrove_mushroom_pot":{"f":"i_rc_earthen_deepgrove_mushroom_pot.png","name":"Earthen Potted Mushroom"},"easterduck":{"f":"i_rc_easterduck.png","name":"Wannabe bunny"},"fall_duck":{"f":"i_rc_fall_duck.png","name":"Pumpkin Duck"},"farm_l_sprinkler":{"f":"i_rc_farm_l_sprinkler.png","name":""},"farm_sprinkler":{"f":"i_rc_farm_sprinkler.png","name":""},"ff_c25_clover":{"f":"i_rc_ff_c25_clover.png","name":"Four Leaf Clover"},"ff_c25_durector":{"f":"i_rc_ff_c25_durector.png","name":"Duck Director"},"ff_c25_luckyduck":{"f":"i_rc_ff_c25_luckyduck.png","name":"Leprechaun Duck"},"floordimmer":{"f":"i_rc_floordimmer.png","name":"Floor Mood Light"},"genieduck":{"f":"i_rc_genieduck.png","name":""},"glukko_bottles":{"f":"i_rc_glukko_bottles.png","name":""},"glukko_bowl1":{"f":"i_rc_glukko_bowl1.png","name":""},"glukko_duck":{"f":"i_rc_glukko_duck.png","name":""},"glukko_jar":{"f":"i_rc_glukko_jar.png","name":""},"glukko_lamp":{"f":"i_rc_glukko_lamp.png","name":""},"glukko_petmush":{"f":"i_rc_glukko_petmush.png","name":""},"glukko_sardine":{"f":"i_rc_glukko_sardine.png","name":""},"hologram":{"f":"i_rc_hologram.png","name":"Holopod"},"hotduck":{"f":"i_rc_hotduck.png","name":"Hot Duck"},"house2":{"f":"i_rc_house2.png","name":"Gingerbread House"},"hween08_defibs":{"f":"i_rc_hween08_defibs.png","name":""},"hween08_defibs2":{"f":"i_rc_hween08_defibs2.png","name":""},"joulutahti":{"f":"i_rc_joulutahti.png","name":"Poinsetta"},"jp_tray1":{"f":"i_rc_jp_tray1.png","name":"Sushi Maguro"},"jp_tray2":{"f":"i_rc_jp_tray2.png","name":"Sushi Ika"},"jp_tray3":{"f":"i_rc_jp_tray3.png","name":"Sushi Ikura"},"jp_tray4":{"f":"i_rc_jp_tray4.png","name":"Sushi Uni"},"jp_tray5":{"f":"i_rc_jp_tray5.png","name":"Sushi Tamago"},"jp_tray6":{"f":"i_rc_jp_tray6.png","name":"Sushi Kohada"},"mushroom_basket":{"f":"i_rc_mushroom_basket.png","name":"Mushroom Basket"},"mushroom_blue_duck":{"f":"i_rc_mushroom_blue_duck.png","name":"Blue Mushroom Duck"},"mushroom_duck":{"f":"i_rc_mushroom_duck.png","name":"Mushroom Duck"},"mushroom_yellow_duck":{"f":"i_rc_mushroom_yellow_duck.png","name":"Yellow Mushroom Duck"},"obsidian_deepgrove_cyclops":{"f":"i_rc_obsidian_deepgrove_cyclops.png","name":""},"obsidian_deepgrove_duck":{"f":"i_rc_obsidian_deepgrove_duck.png","name":""},"obsidian_deepgrove_mushroom_pot":{"f":"i_rc_obsidian_deepgrove_mushroom_pot.png","name":"Obsidian Potted Mushroom"},"pirate_bottle_1":{"f":"i_rc_pirate_bottle_1.png","name":"Glass Bottle 1"},"pirate_bottle_10":{"f":"i_rc_pirate_bottle_10.png","name":"Glass Bottle 10"},"pirate_bottle_2":{"f":"i_rc_pirate_bottle_2.png","name":"Glass Bottle 2"},"pirate_bottle_3":{"f":"i_rc_pirate_bottle_3.png","name":"Glass Bottle 3"},"pirate_bottle_4":{"f":"i_rc_pirate_bottle_4.png","name":"Glass Bottle 4"},"pirate_bottle_5":{"f":"i_rc_pirate_bottle_5.png","name":"Glass Bottle 5"},"pirate_bottle_6":{"f":"i_rc_pirate_bottle_6.png","name":"Glass Bottle 6"},"pirate_bottle_7":{"f":"i_rc_pirate_bottle_7.png","name":"Glass Bottle 7"},"pirate_bottle_8":{"f":"i_rc_pirate_bottle_8.png","name":"Glass Bottle 8"},"pirate_bottle_9":{"f":"i_rc_pirate_bottle_9.png","name":"Glass Bottle 9"},"prize1":{"f":"i_rc_prize1.png","name":"Gold Trophy"},"prize2":{"f":"i_rc_prize2.png","name":"Silver Trophy"},"prize3":{"f":"i_rc_prize3.png","name":"Bronze Trophy"},"pumpcandle":{"f":"i_rc_pumpcandle.png","name":"Pumpkin Candle Holder"},"qt_sum11_petfood":{"f":"i_rc_qt_sum11_petfood.png","name":"Catch of the Day"},"qt_sum11_shell2":{"f":"i_rc_qt_sum11_shell2.png","name":"Star Fish"},"qt_val11_holoduck":{"f":"i_rc_qt_val11_holoduck.png","name":"Holo-Duck"},"rcandle":{"f":"i_rc_rcandle.png","name":"Red Candle"},"redhologram":{"f":"i_rc_redhologram.png","name":"Holo-girl"},"reinduck":{"f":"i_rc_reinduck.png","name":"Reindeer Duck"},"sheji_divider":{"f":"i_rc_sheji_divider.png","name":"Sheji Divider"},"skullcandle":{"f":"i_rc_skullcandle.png","name":"Skull Candle Holder"},"small_xmastree":{"f":"i_rc_small_xmastree.png","name":"Small Christmas Tree"},"song_disk":{"f":"i_rc_song_disk.png","name":"Traxdisc"},"steam_duck":{"f":"i_rc_steam_duck.png","name":"Steam Powered Duck"},"streetduck":{"f":"i_rc_streetduck.png","name":"Faction Duck"},"sunsetcafe_c20_duck":{"f":"i_rc_sunsetcafe_c20_duck.png","name":"Summer Funk Duck"},"sushiduck1":{"f":"i_rc_sushiduck1.png","name":""},"sushiduck2":{"f":"i_rc_sushiduck2.png","name":""},"sushiduck3":{"f":"i_rc_sushiduck3.png","name":""},"toby_grave_fire":{"f":"i_rc_toby_grave_fire.png","name":""},"toby_mode_lever":{"f":"i_rc_toby_mode_lever.png","name":"Mode Lever"},"triplecandle":{"f":"i_rc_triplecandle.png","name":"Electric Candles"},"urban_wpost":{"f":"i_rc_urban_wpost.png","name":"Fire Hydrant"},"valeduck":{"f":"i_rc_valeduck.png","name":"Valentine's Duck"},"verdigris_deepgrove_cyclops":{"f":"i_rc_verdigris_deepgrove_cyclops.png","name":""},"verdigris_deepgrove_duck":{"f":"i_rc_verdigris_deepgrove_duck.png","name":""},"verdigris_deepgrove_mushroom_pot":{"f":"i_rc_verdigris_deepgrove_mushroom_pot.png","name":"Verdigris Potted Mushroom"},"wcandle":{"f":"i_rc_wcandle.png","name":"White Candle"},"wrapped_duck":{"f":"i_rc_wrapped_duck.png","name":"Funky Gift"},"xmasduck":{"f":"i_rc_xmasduck.png","name":"Christmas Rubber Duck"}},"rare0":"capsule_silver"},"trophy":{"f":"i_trophy.png","ox":42,"oy":72,"w":60,"h":98},"mark_scuff":{"f":"i_mark_scuff.png","ox":10,"oy":14,"w":20,"h":29},"mark_tile":{"f":"i_mark_tile.png","ox":14,"oy":5,"w":29,"h":10},"xmastree":{"f":"i_xmastree.png","ox":18,"oy":65,"w":36,"h":68},"gift1":{"f":"i_gift1.png","ox":12,"oy":22,"w":24,"h":26},"gift2":{"f":"i_gift2.png","ox":12,"oy":22,"w":24,"h":26},"gift3":{"f":"i_gift3.png","ox":12,"oy":22,"w":24,"h":26},"gift4":{"f":"i_gift4.png","ox":12,"oy":22,"w":24,"h":26},"xmaslantern":{"f":"i_xmaslantern.png","ox":11,"oy":16,"w":23,"h":20},"xmassmalltree":{"f":"i_xmassmalltree.png","ox":7,"oy":24,"w":15,"h":28},"xmasdrinks":{"f":"i_xmasdrinks.png","ox":11,"oy":15,"w":22,"h":19},"xmasduck":{"f":"i_xmasduck.png","ox":6,"oy":11,"w":12,"h":15},"snowman":{"f":"i_snowman.png","ox":10,"oy":44,"w":21,"h":49},"bookdoor":{"f":"i_bookdoor.png","ox":74,"oy":83,"w":170,"h":179}}; if (typeof module !== "undefined") { module.exports = L; L.floor = F; } else { window.WALL_ITEMS = L; window.FLOOR_PIECES = F; } })();

} };
MODULES["png-decode.js"] = { dir: "/site/tools", run: function (module, exports, require, __dirname) {
/* Just enough PNG reader to get pixels back out of a file.

   tools/png-encode.js writes them; this reads them, which is what any check
   on the artwork needs — the browser refuses getImageData on a canvas that
   has touched furniindex.com, so measuring a sprite has to happen here.

   Handles the colour types these files actually use: RGBA, RGB, greyscale
   and palette, with the five standard filters, at 8 bits and — for greyscale
   and palette, which are the only ones PNG allows to be packed — at 1, 2 and
   4. Interlaced images are refused rather than half-read. */

const zlib = require("zlib");
const fs = require("fs");

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");

    let p = 8, ihdr = null, palette = null, trns = null;
    const idat = [];
    while (p < buf.length) {
        const len = buf.readUInt32BE(p);
        const type = buf.toString("latin1", p + 4, p + 8);
        const body = buf.subarray(p + 8, p + 8 + len);
        if (type === "IHDR") {
            ihdr = {
                w: body.readUInt32BE(0), h: body.readUInt32BE(4),
                depth: body[8], colour: body[9], interlace: body[12]
            };
        } else if (type === "PLTE") palette = body;
        else if (type === "tRNS") trns = body;
        else if (type === "IDAT") idat.push(body);
        else if (type === "IEND") break;
        p += 12 + len;
    }
    if (!ihdr) throw new Error("no IHDR");
    if (ihdr.interlace) throw new Error("interlaced png not supported");
    if (ihdr.depth !== 8 && !(ihdr.depth < 8 && (ihdr.colour === 0 || ihdr.colour === 3)))
        throw new Error(`unsupported bit depth ${ihdr.depth}`);

    const { w, h, colour } = ihdr;
    const ch = CHANNELS[colour];
    if (!ch) throw new Error(`unsupported colour type ${colour}`);

    const raw = zlib.inflateSync(Buffer.concat(idat));
    /* Sub-byte depths: 1, 2 and 4 bits, packed high bits first and padded to a
       whole byte at the end of each row. Only greyscale and palette images can
       be packed that way, which is the check above. FurniIndex publish some of
       their artwork as 4-bit palette PNGs — a file this reader used to refuse
       outright, which is not a failure a caller should have to work around. */
    const stride = ihdr.depth === 8 ? w * ch : Math.ceil(w * ihdr.depth / 8);
    const out = Buffer.alloc(w * h * 4);

    let prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
        const filter = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));

        // Undo the per-scanline filter. `a` is the pixel to the left, `b`
        // above, `c` above-left — all in BYTES, hence the ch stride.
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? line[i - ch] : 0;
            const b = prev[i];
            const c = i >= ch ? prev[i - ch] : 0;
            let v = line[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const pp = a + b - c;
                const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            line[i] = v & 255;
        }
        prev = line;

        // Unpack a sub-byte row into one byte per sample before reading it.
        const row = ihdr.depth === 8 ? line : (() => {
            const d = ihdr.depth, per = 8 / d, mask = (1 << d) - 1;
            const b = Buffer.alloc(w);
            for (let x = 0; x < w; x++) {
                const shift = 8 - d * ((x % per) + 1);
                b[x] = (line[(x / per) | 0] >> shift) & mask;
            }
            return b;
        })();

        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const i = ihdr.depth === 8 ? x * ch : x;
            const line = row;
            if (colour === 6) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = line[i + 3]; }
            else if (colour === 2) { out[o] = line[i]; out[o + 1] = line[i + 1]; out[o + 2] = line[i + 2]; out[o + 3] = 255; }
            else if (colour === 0) {
                // A 4-bit grey of 15 is white, not near-black: scale to 0-255.
                const g = ihdr.depth === 8 ? line[i] : Math.round(line[i] * 255 / ((1 << ihdr.depth) - 1));
                out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255;
            }
            else if (colour === 4) { out[o] = out[o + 1] = out[o + 2] = line[i]; out[o + 3] = line[i + 1]; }
            else if (colour === 3) {
                const idx = line[i];
                out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
                out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
            }
        }
    }
    return { w, h, rgba: out };
}

const readPng = (file) => decodePng(fs.readFileSync(file));

/* The box of pixels that are actually drawn. x1/y1 are EXCLUSIVE. Returns
   null for a fully transparent image rather than an inside-out box. */
function opaqueBox(img, alphaMin) {
    const min = alphaMin === undefined ? 8 : alphaMin;
    let x0 = img.w, x1 = -1, y0 = img.h, y1 = -1;
    for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
            if (img.rgba[(y * img.w + x) * 4 + 3] <= min) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return null;
    return { x0, y0, x1: x1 + 1, y1: y1 + 1, w: x1 + 1 - x0, h: y1 + 1 - y0 };
}

module.exports = { decodePng, readPng, opaqueBox };

} };
/* What the renderer in a browser is asked to do: the same as render/worker.js and the local server's /api/lift and /api/sign. */
let W = null, ready = null;
const maps = new Map();
const TILE = 512;
const isBlank = d => { for (let i = 0; i < d.length; i += 4) if ((d[i] || d[i + 1] || d[i + 2]) && !(d[i] === 7 && d[i + 1] === 6 && d[i + 2] === 10)) return false; return true; };
const solidCopy = d => { const o = new Uint8Array(d.length); o.set(d); for (let i = 0; i < o.length; i += 4) { if (o[i] === 7 && o[i + 1] === 6 && o[i + 2] === 10) o[i] = o[i + 1] = o[i + 2] = 0; o[i + 3] = 255; } return o; };
function lift(way, slide) {
    const bw = 180, bh = 200, ax = 40, ay = 160, b = new W.Buf(bw, bh);
    for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
    const fake = { b, z: 0, ox: ax, oy: ay, lamps: [], sprites: [], S(x, y) { return [Math.round((x - y) * 16) + ax, Math.round((x + y) * 8) + ay]; }, WX(x, y, u, h) { const p = this.S(x, y); return [p[0] + u, p[1] + Math.floor(u / 2) - h]; } };
    W.lift(fake, 0, 0, slide >= 1 ? { open: true } : { slide });
    W.recolour(b, way, [0, 0, bw, bh]);
    for (let i = 0; i < b.d.length; i += 4) if (b.d[i] === 255 && b.d[i + 1] === 0 && b.d[i + 2] === 255) b.d[i + 3] = 0;
    return { w: bw, h: bh, d: b.d };
}
function sign(q) {
    const sw = Number(q.w) || 0, sh = Number(q.h) || 0, name = q.name || "", bw = Math.max(sw, 240) + 40, bh = (bw >> 1) + Math.max(sh, 100) + 60, cx = bw >> 1, cy = bh - (bw >> 2) - 20, b = new W.Buf(bw, bh);
    for (let i = 0; i < b.d.length; i += 4) { b.d[i] = 255; b.d[i + 1] = 0; b.d[i + 2] = 255; b.d[i + 3] = 255; }
    if (q.stair) W.stairPlaque(b, cx, cy, name);
    else W.signIso(b, cx, cy, name, { alongY: q.y === "1", max: 14, w: sw || undefined, h: sh || undefined, way: q.way });
    for (let i = 0; i < b.d.length; i += 4) { if (b.d[i + 1] !== 0 || b.d[i] !== b.d[i + 2]) continue; if (b.d[i] === 255) b.d[i + 3] = 0; else { b.d[i] = 0; b.d[i + 2] = 0; b.d[i + 3] = 115; } }
    return { w: bw, h: bh, d: b.d, cx, cy };
}
const send = (id, o, buf) => postMessage({ id, ...o }, buf || []);
onmessage = async e => {
    const job = e.data;
    try {
        if (job.type === "start") {
            mazeList = job.names.map(n => "x\t" + n).join("\n");
            if (!ready) ready = loadArt(job.base).then(() => { W = requireFrom(ROOT)("hw3.js"); });
            await ready;
            const font = {}; for (const ch in W.H.VOL.vb) font[ch] = W.H.VOL.vb[ch].w;
            return send(job.id, { font });
        }
        await ready;
        if (job.type === "report") { let report; try { report = W.fromMap(JSON.parse(job.text), job.names).report; } catch (err) { report = { error: String(err && err.message || err) }; } return send(job.id, { report }); }
        if (job.type === "map") { maps.set(job.v, JSON.parse(job.text)); while (maps.size > 4) maps.delete(maps.keys().next().value); return send(job.id, { ok: true }); }
        if (job.type === "tile") {
            const map = maps.get(job.v); if (!map) return send(job.id, { needMap: true });
            const { x, y, w, h } = job, cx = x + w / 2, cy = y + h / 2, MX = (cx + 2 * cy) / 32, MY = (2 * cy - cx) / 32;
            const pad = job.pad || 0, world = W.build({ map, names: job.names, liftOpen: job.liftOpen, cut: job.cut, light: job.light, clip: [MX, MY, 0, w + 2 * pad, h + 2 * pad] });      // pad: what stands just outside the square still gets its say on the square
            const c = world.at(MX, MY, 0), crop = world.b.crop(c[0] - w / 2, c[1] - h / 2, w, h), d = new Uint8Array(crop.d);
            return send(job.id, { w, h, d }, [d.buffer]);
        }
        /* A whole time of day, for publishing: every square with anything on it */
        if (job.type === "mood") {
            const world = W.build({ map: JSON.parse(job.text), names: job.names, light: job.light }), b = world.b, o = world.at(0, 0, 0), out = [];
            const tx0 = Math.floor(-o[0] / TILE), ty0 = Math.floor(-o[1] / TILE), tx1 = Math.ceil((b.w - o[0]) / TILE), ty1 = Math.ceil((b.h - o[1]) / TILE);
            for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
                const v = b.crop(o[0] + tx * TILE, o[1] + ty * TILE, TILE, TILE); if (isBlank(v.d)) continue;
                out.push({ tx, ty, d: solidCopy(v.d) });
            }
            return send(job.id, { tiles: out }, out.map(t => t.d.buffer));
        }
        if (job.type === "lift" || job.type === "sign") {
            const r = job.type === "lift" ? lift(job.way, job.slide) : sign(job.q), d = new Uint8Array(r.d);
            return send(job.id, { w: r.w, h: r.h, d, cx: r.cx, cy: r.cy }, [d.buffer]);
        }
        throw new Error("No such job: " + job.type);
    } catch (err) { send(job.id, { error: String(err && err.stack || err) }); }
};

