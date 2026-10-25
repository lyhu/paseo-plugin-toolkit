export const fixtureBundle = `__d(function(g,r,i,a,m,e,d){
e.getLanguageForFile=E;e.getSupportedExtensions=function(){return Object.keys(C)};
var s=r(d[0]);const C={swift:s.StreamLanguage.define({token(t){t.skipToEnd();return null}}),js:{existing:true}};
function E(s){const p=s.split(".").pop()?.toLowerCase();return p?C[p]??null:null}
});`;
