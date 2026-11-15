import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../../src/auth/read-scopes.ts',import.meta.url),'utf8');
const {readScopes}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('planning profile retains production reads and adds planet/city/skill evidence',()=>{
 const scopes=readScopes('planning');
 for(const s of ['faction_inv_cities_read','faction_inv_planets_read','faction_inv_facilities_read',
  'faction_inv_stations_read','faction_inv_materials_read','character_skills','character_events'])assert.ok(scopes.includes(s));
 assert.ok(!scopes.includes('messages_read'));
});
test('all-read includes all eleven inventory categories and tags for both owner classes',()=>{
 const scopes=readScopes('all-read');
 for(const owner of ['personal','faction'])for(const kind of ['ships','vehicles','stations','cities','facilities','planets','items','npcs','droids','materials','creatures']){
  assert.ok(scopes.includes(`${owner}_inv_${kind}_read`));assert.ok(scopes.includes(`${owner}_inv_${kind}_tags_read`));
 }
 for(const s of ['messages_read','character_credits','faction_budgets_read','faction_datacards_read'])assert.ok(scopes.includes(s));
 assert.equal(scopes.length,new Set(scopes).size);
});
test('neither read profile contains mutation or broad all scopes',()=>{
 for(const profile of ['planning','all-read'])for(const scope of readScopes(profile))
  assert.ok(!/(?:_write|_all|_assign|_makeover|_rename|_send|_delete)$/.test(scope),scope);
 assert.throws(()=>readScopes('all'));
});
