import test from 'node:test';
import assert from 'node:assert/strict';
import {saveGeneratedMap,deleteGeneratedMap} from '../server/generated-map-storage.js';
function collection(){const rows=new Map();const matches=(row,filter)=>row&&Object.entries(filter).every(([key,value])=>String(row[key])===String(value));return {rows,async findOne(filter){const row=rows.get(String(filter._id));return matches(row,filter)?structuredClone(row):null;},async updateOne(filter,update,options){let row=rows.get(String(filter._id));if(!row&&options.upsert)row={...filter,...update.$setOnInsert};if(!row)return {matchedCount:0};Object.assign(row,update.$set);for(const [key,n] of Object.entries(update.$inc??{}))row[key]=(row[key]??0)+n;rows.set(String(filter._id),row);return {matchedCount:1};},async findOneAndUpdate(filter,update,options){await this.updateOne(filter,update,options);return this.findOne(filter);},async deleteOne(filter){const row=await this.findOne(filter);if(row)rows.delete(String(filter._id));return {deletedCount:row?1:0};}};}
test('deleting a map removes its entire document and artwork and prevents stale save resurrection',async()=>{
 const drafts=collection(),guards=collection(),session={};const map={generatedAssets:[{image:'sprite'}],textures:[{image:'paint'}],placed:[{a:'asset'}],paint:{1:{id:'paint'}}};
 await saveGeneratedMap(drafts,guards,'owner','map',map,session);
 await saveGeneratedMap(drafts,guards,'owner','other',{name:'Keep'},session);
 assert.equal(await deleteGeneratedMap(drafts,guards,'owner','map',session),true);
 assert.equal(await drafts.findOne({_id:'map'}),null);assert.ok(await drafts.findOne({_id:'other'}));
 assert.equal(await saveGeneratedMap(drafts,guards,'owner','map',map,session),410);
 assert.equal(await drafts.findOne({_id:'map'}),null);
 assert.deepEqual(Object.keys(guards.rows.get('map')).sort(),['_id','deleted','revision','userId']);
});
test('another owner cannot delete or overwrite a map',async()=>{
 const drafts=collection(),guards=collection();await saveGeneratedMap(drafts,guards,'creator','map',{name:'Original'},{});
 assert.equal(await deleteGeneratedMap(drafts,guards,'visitor','map',{}),false);
 assert.equal(await saveGeneratedMap(drafts,guards,'visitor','map',{name:'Changed'},{}),404);
 assert.equal((await drafts.findOne({_id:'map'})).map.name,'Original');
});
