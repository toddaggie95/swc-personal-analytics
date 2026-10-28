import test from 'node:test';
import assert from 'node:assert/strict';
import {productionNotification} from './production-change-notification.mjs';
test('does not notify on baseline or unchanged comparison',()=>{
 assert.equal(productionNotification({status:'baseline_created',changes:[]}).notify,false);
 assert.equal(productionNotification({status:'compared',changes:[]}).notify,false);
});
test('summarizes starts stops and newly ready',()=>{
 const changes=[{field:'started',before:false,after:true},{field:'started',before:true,after:false},{field:'readiness',before:'blocked',after:'ready_now'},{field:'ship',before:'A',after:'B'}];
 const n=productionNotification({status:'compared',changes});
 assert.equal(n.notify,true);
 assert.equal(n.subject,'SWC production: 1 started, 1 stopped, 1 newly ready, 1 other changes');
});
