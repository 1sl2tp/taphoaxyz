/* UI-120: Presentation-only product title formatter.
 * Capitalize the FIRST Unicode letter (Vietnamese supported) without
 * lowercasing the remaining string, modifying product IDs, DB or search keys.
 * Examples: 'sữa tươi TH' -> 'Sữa tươi TH'; 'đường 5kg' -> 'Đường 5kg';
 * '5*' -> '5*'; 'Bột OMO' -> 'Bột OMO'. Repeated calls are idempotent.
 */
(function(){
  'use strict';
  function formatProductDisplayName(value){
    const text=String(value??'');
    const first=/\p{L}/u.exec(text);
    if(!first)return text;
    const upper=first[0].toLocaleUpperCase('vi-VN');
    return text.slice(0,first.index)+upper+text.slice(first.index+first[0].length);
  }
  window.TAPHOA_FORMAT_PRODUCT_NAME=formatProductDisplayName;
})();
