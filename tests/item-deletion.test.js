import test from 'node:test';
import assert from 'node:assert/strict';
import {removeItemReferences,assertItemsNotDeleted} from '../server/item-deletion.js';
test('permanent deletion removes all copies, shortcuts, drops and selection without changing other items',()=>{
 const state={slots:[{key:'a',itemId:'carrot',quantity:99},{key:'b',itemId:'carrot',quantity:10},{key:'c',itemId:'stone',quantity:4}],hotbar:['carrot','stone','carrot',null],selectedId:'carrot',drops:[{id:'drop1',itemId:'carrot',quantity:2},{id:'drop2',itemId:'stone',quantity:1}],revision:7};
 const before=structuredClone(state),clean=removeItemReferences(state,'carrot');
 assert.deepEqual(state,before);assert.deepEqual(clean.slots,[{...state.slots[2],position:2}]);
 assert.deepEqual(clean.hotbar,[null,null,'stone',null]);assert.equal(clean.selectedId,null);
 assert.deepEqual(clean.drops,[state.drops[1]]);assert.equal(clean.revision,8);
});
test('deleting an unowned item preserves unrelated equipment selection',()=>{
 const state={slots:[{itemId:'hoe',quantity:1}],hotbar:['hoe'],selectedId:'hoe',drops:[],revision:2};
 assert.equal(removeItemReferences(state,'carrot').selectedId,'hoe');
});
test('stale world saves cannot restore permanently deleted IDs',()=>{
 assert.throws(()=>assertItemsNotDeleted([{id:'carrot'}],['carrot']),error=>error.deletedItem===true);
 assert.doesNotThrow(()=>assertItemsNotDeleted([{id:'stone'}],['carrot']));
});
