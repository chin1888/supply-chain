/* 采购审批工作流测试：
   1) 看板渲染 + 种子演示数据落位（在改动前先校验）
   2) 数据层状态机：admin 指派经理 → 经理指派操作员 → 操作员提交 → 经理审核通过（转正式单）
   3) 驳回回退：提交 → 驳回 → 重新提交
   4) 角色作用域：非负责人/非指派操作员看不到可执行动作（仅有「查看」） */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname.replace(/tests$/, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const SHIM = '<script>(function(){var m={};var ls={getItem:function(k){return m[k]||null;},' +
  'setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];},clear:function(){m={};}};' +
  'try{Object.defineProperty(window,"localStorage",{configurable:true,value:ls});}catch(e){}})();</script>';

function load(file) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8').replace('<head>', '<head>' + SHIM);
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { if (!/Not implemented/i.test(e.message || '')) errs.push('[jsdomError] ' + (e.message || e)); });
  const dom = new JSDOM(html, {
    url: 'file:///' + path.join(DIR, file).replace(/\\/g, '/'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
  });
  dom.window.addEventListener('error', e => errs.push('[window.error] ' + (e.error && e.error.message || e.message)));
  return { dom, errs, w: dom.window, d: dom.window.document };
}

(async () => {
  let code = 0;
  const { w, d, errs } = load('admin.html');
  await sleep(1200);
  let f = 0;
  const check = (name, ok, extra) => { console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) f++; };
  const S = () => w.Store;
  const setRole = (id, role) => { const u = S().list('users').filter(x => x.id === id)[0]; S().setSession({ userId: u.id, role: u.role, name: u.name, dept: u.dept }); };
  const FRESH = () => S().list('purchases').filter(p => !p.flow)[0];

  // ---------- 1. 看板渲染 + 种子演示数据落位（改动前先校验） ----------
  {
    S().setSession({ userId: 'U1', role: 'admin', name: '管理员', dept: '运营部' });
    w.location.hash = '#/purchases'; w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    await sleep(400);
    const app = d.querySelector('#aApp');
    check('采购页渲染了流程看板', !!app.querySelector('.flow-cols'));
    const stageCols = app.querySelectorAll('.flow-col').length;
    check('看板含 5 个阶段列（含已驳回）', stageCols === 5, 'cols=' + stageCols);
    check('列表含「审批流程」列', app.textContent.includes('审批流程'));
    check('列表含「部门经理」「业务操作员」列', app.textContent.includes('部门经理') && app.textContent.includes('业务操作员'));
    const flows = {};
    S().list('purchases').forEach(p => { if (p.flow) flows[p.no] = p.flow; });
    check('演示单 PO-202601 在 to_manager', flows['PO-202601'] === 'to_manager', JSON.stringify(flows));
    check('演示单 PO-202602 在 to_operator', flows['PO-202602'] === 'to_operator');
    check('演示单 PO-202603 在 submitted', flows['PO-202603'] === 'submitted');
  }

  // ---------- 2. 状态机：完整正向流程 ----------
  {
    const po = FRESH();
    check('取到一张普通（无流程）采购单', !!po && !po.flow);
    setRole('U1', 'admin');
    let acts = S().poWorkflow.actionsFor(po);
    check('admin 对普通单可见「发起审批流程」', acts.some(a => a.action === 'assign_manager'));
    S().poWorkflow.apply(po, 'assign_manager', { userId: 'U2', name: '张伟' });
    check('指派经理后 flow=to_manager', S().find('purchases', po.id).flow === 'to_manager');
    check('经理已记录', S().find('purchases', po.id).managerId === 'U2');

    setRole('U2', 'manager');
    acts = S().poWorkflow.actionsFor(S().find('purchases', po.id));
    check('经理(负责)可见「指派操作员」', acts.some(a => a.action === 'assign_operator'));
    S().poWorkflow.apply(S().find('purchases', po.id), 'assign_operator', { userId: 'U3', name: '李静' });
    check('指派操作员后 flow=to_operator', S().find('purchases', po.id).flow === 'to_operator');
    check('操作员已记录', S().find('purchases', po.id).operatorId === 'U3');

    setRole('U3', 'operator');
    acts = S().poWorkflow.actionsFor(S().find('purchases', po.id));
    check('操作员(指派)可见「提交审核」', acts.some(a => a.action === 'submit'));
    S().poWorkflow.apply(S().find('purchases', po.id), 'submit', { note: '已填报明细' });
    check('提交后 flow=submitted', S().find('purchases', po.id).flow === 'submitted');

    setRole('U2', 'manager');
    acts = S().poWorkflow.actionsFor(S().find('purchases', po.id));
    check('经理可见「审核通过」', acts.some(a => a.action === 'approve'));
    S().poWorkflow.apply(S().find('purchases', po.id), 'approve', {});
    const done = S().find('purchases', po.id);
    check('审核通过后 flow=approved', done.flow === 'approved');
    check('审核通过后 status=approved（正式单）', done.status === 'approved');
    check('流程留痕 ≥4 条（4 个动作）', (done.timeline || []).length >= 4, 'tl=' + (done.timeline || []).length);
  }

  // ---------- 3. 驳回回退 ----------
  {
    const po = FRESH();
    setRole('U1', 'admin'); S().poWorkflow.apply(po, 'assign_manager', { userId: 'U2', name: '张伟' });
    setRole('U2', 'manager'); S().poWorkflow.apply(S().find('purchases', po.id), 'assign_operator', { userId: 'U3', name: '李静' });
    setRole('U3', 'operator'); S().poWorkflow.apply(S().find('purchases', po.id), 'submit', { note: '提交' });
    setRole('U2', 'manager');
    S().poWorkflow.apply(S().find('purchases', po.id), 'reject', { note: '数量不对' });
    check('驳回后 flow=rejected', S().find('purchases', po.id).flow === 'rejected');
    check('驳回保留原因', (S().find('purchases', po.id).timeline || []).some(t => t.action === 'reject' && /数量不对/.test(t.note || '')));
    setRole('U3', 'operator');
    S().poWorkflow.apply(S().find('purchases', po.id), 'submit', { note: '已修正' });
    check('驳回后操作员可重新提交 → submitted', S().find('purchases', po.id).flow === 'submitted');
  }

  // ---------- 4. 角色作用域 ----------
  {
    const po = FRESH();
    setRole('U1', 'admin'); S().poWorkflow.apply(po, 'assign_manager', { userId: 'U2', name: '张伟' }); // to_manager, 无操作员
    setRole('U3', 'operator');
    const opActs = S().poWorkflow.actionsFor(S().find('purchases', po.id));
    const hasReal = opActs.some(a => ['submit', 'assign_manager', 'assign_operator', 'approve', 'reject'].indexOf(a.action) >= 0);
    check('未指派给该操作员 → 操作员无「提交/指派/审核」等可执行动作', !hasReal, 'acts=' + opActs.map(a => a.action).join(','));
    setRole('U2', 'manager');
    check('负责的经理对 to_manager 单可见「指派操作员」', S().poWorkflow.actionsFor(S().find('purchases', po.id)).some(a => a.action === 'assign_operator'));
    S().setSession({ userId: 'guest', role: 'viewer', name: '访客', dept: '-' });
    check('只读访客无任何流程动作', S().poWorkflow.actionsFor(S().find('purchases', po.id)).length === 0);
  }

  check('无运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n========== 采购审批工作流：' + (f ? f + ' 项失败' : '全部通过 ✓') + ' ==========');
  if (f) code = 1;
  process.exit(code);
})();
