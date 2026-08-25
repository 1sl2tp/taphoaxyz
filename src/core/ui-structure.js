export const UI_NODE_KINDS=Object.freeze(['root','navigation','screen-host','system-layer','screen','workspace','surface','region']);
export const REQUIRED_OWNER_KEYS=Object.freeze(['geometry','paint','interaction','state','scroll','focus']);
export const REQUIRED_FLOW_KEYS=Object.freeze(['id','source','action','mutationOwner','targetState','targetRegion','back']);
export const STRUCTURE_GATES=Object.freeze(['tree','naming','owner','placement','flow']);

const issue=(gate,message)=>({gate,message});
const semanticId=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const attrsFromTag=tag=>{
  const attrs={};
  for(const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g))attrs[match[1]]=match[2];
  return attrs;
};

export function validateStructureContract(contract){
  const issues=[];
  if(!contract?.id)issues.push(issue('tree','contract.id missing'));
  if(!contract?.root?.id)issues.push(issue('tree',`${contract?.id||'contract'} root.id missing`));
  if(!Array.isArray(contract?.root?.children))issues.push(issue('tree',`${contract?.id||'contract'} root.children must be explicit`));

  const nodes=Array.isArray(contract?.nodes)?contract.nodes:[];
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const known=new Set([contract?.root?.id,...byId.keys()].filter(Boolean));

  for(const child of contract?.root?.children||[]){
    const node=byId.get(child);
    if(!node)issues.push(issue('tree',`${contract.root.id} child ${child} missing`));
    else if(node.parent!==contract.root.id)issues.push(issue('tree',`${child} root parent mismatch`));
  }

  for(const node of nodes){
    if(!semanticId.test(String(node.id||'')))issues.push(issue('naming',`${node.id||'?'} must use semantic kebab-case id`));
    if(!UI_NODE_KINDS.includes(node.kind))issues.push(issue('tree',`${node.id} invalid kind ${node.kind}`));
    if(!known.has(node.parent))issues.push(issue('tree',`${node.id} unresolved parent ${node.parent}`));
    if(!Array.isArray(node.children))issues.push(issue('tree',`${node.id} children must be explicit array`));
    if(!String(node.purpose||'').trim())issues.push(issue('tree',`${node.id} purpose missing`));
    for(const key of REQUIRED_OWNER_KEYS){
      if(!String(node.owners?.[key]||'').trim())issues.push(issue('owner',`${node.id} owner ${key} missing`));
    }
    for(const child of node.children||[]){
      const childNode=byId.get(child);
      if(!childNode)issues.push(issue('tree',`${node.id} child ${child} missing`));
      else if(childNode.parent!==node.id)issues.push(issue('tree',`${node.id} child ${child} parent mismatch`));
    }
    if(node.kind==='surface'){
      if(Number(node.placement?.mobile)!==1)issues.push(issue('placement',`${node.id} mobile Surface must use Slot 1`));
      if(![1,2,3].includes(Number(node.placement?.wide)))issues.push(issue('placement',`${node.id} wide Surface must use Slot 1/2/3`));
    }
  }

  for(const flow of contract?.flows||[]){
    for(const key of REQUIRED_FLOW_KEYS){
      if(!String(flow?.[key]||'').trim())issues.push(issue('flow',`${contract.id} flow ${flow?.id||'?'} missing ${key}`));
    }
  }
  return issues;
}

export function auditMarkupStructure(html='',contract){
  const issues=[...validateStructureContract(contract)];
  const rootToken=`${contract.root.attribute}="${contract.root.value}"`;
  if(!html.includes(rootToken))issues.push(issue('tree',`${contract.id} missing root marker ${rootToken}`));
  const found=[];

  for(const node of contract.nodes||[]){
    const token=`data-ui-id="${node.id}"`,index=html.indexOf(token);
    if(index<0){issues.push(issue('tree',`${contract.id} markup missing ${node.id}`));continue;}
    const start=html.lastIndexOf('<',index),end=html.indexOf('>',index);
    const attrs=attrsFromTag(html.slice(start,end+1));
    if(attrs['data-ui-node']!==node.kind)issues.push(issue('tree',`${node.id} kind marker mismatch`));
    if(attrs['data-parent-id']!==node.parent)issues.push(issue('tree',`${node.id} parent marker mismatch`));
    if(node.kind==='surface'){
      if(Number(attrs['data-slot-mobile'])!==node.placement.mobile)issues.push(issue('placement',`${node.id} mobile slot marker mismatch`));
      if(Number(attrs['data-slot-wide'])!==node.placement.wide)issues.push(issue('placement',`${node.id} wide slot marker mismatch`));
    }
    found.push({node,index});
  }

  const groups=new Map();
  for(const item of found){const list=groups.get(item.node.parent)||[];list.push(item);groups.set(item.node.parent,list);}
  for(const list of groups.values()){
    const expected=[...list].sort((a,b)=>a.node.order-b.node.order).map(x=>x.node.id);
    const actual=[...list].sort((a,b)=>a.index-b.index).map(x=>x.node.id);
    if(expected.join('|')!==actual.join('|'))issues.push(issue('tree',`${contract.id} source order mismatch under ${list[0].node.parent}`));
  }

  const gates=Object.fromEntries(STRUCTURE_GATES.map(gate=>[gate,!issues.some(x=>x.gate===gate)]));
  return {pass:issues.length===0,issues,gates};
}
