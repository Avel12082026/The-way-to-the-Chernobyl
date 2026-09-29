(function(root){
'use strict';
// One distinct reaction per damaged character, independent of burst shot count.
const bank={
 version:'combat-reactions-20260929-v1',
 base:'audio/reactions/',
 reactions:{
  player:{files:['player-hurt-1.mp3','player-hurt-2.mp3'],gain:.85},
  enemy:{files:['enemy-hurt-1.mp3','enemy-hurt-2.mp3','enemy-hurt-3.mp3','enemy-hurt-4.mp3','enemy-hurt-5.mp3','enemy-hurt-6.mp3','enemy-hurt-7.mp3','enemy-hurt-8.mp3'],gain:.85}
 }
};
root.COMBAT_REACTION_BANK=bank;
if(typeof module!=='undefined')module.exports=bank;
})(typeof window!=='undefined'?window:globalThis);
