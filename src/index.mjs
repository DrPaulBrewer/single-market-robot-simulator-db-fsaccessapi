/* Copyright 2022- Paul Brewer, Economic and Financial Technology Consulting LLC */
/* This file is open source software.  The MIT License applies to this software. */

import { expectSafeObject, StudyFolder } from "single-market-robot-simulator-db-studyfolder";

const handlers = [
  ['json','json'],
  ['txt','text'],
  ['md','text'],
  ['zip','arrayBuffer']
];

async function consensual({handle, op, write}){
    let result;
    const mode = (write)? 'readwrite': 'read';
    const isGranted = (s)=>(s.toLowerCase()==='granted');
    try {
        result = await op(handle);
    } catch(e){
        if (/allowed/i.test(e.toString())){
	    const perm = await handle.queryPermission({mode});
	    if (isGranted(perm))
	        return op(handle);
	    const asked = await handle.requestPermission({mode});
	    if (isGranted(asked))
	        return op(handle);
	}
	throw new Error(e);
    }
    return result;
}

export class StudyFolderForFSAccessAPI extends StudyFolder {

 // { dh, manifest } = options

  constructor(options){
    super(options);
  }
  
  async search(name){
    if (name===undefined){
       return this.manifest;
    }
    const entry = this.manifest.find((f)=>(f.name===name));
    if (entry)
      return [entry];
    return [];
  }

  async download({name}){
    if (typeof(name)!=='string') throw new Error("name[string] required");
    const pair = handlers.find(([ext])=>(name.endsWith(ext)));
    if (pair){
      const [ext, method] = pair; // eslint-disable-line no-unused-vars
      const [f] = await this.search(name);
      if (f===undefined)
        throw new Error(`cannot find file ${name}`);
      const blob = await consensual({handle:f.fh, op:async (fh)=>(fh.getFile())});
      const result = (method)? (await blob[method]()) : blob;
      if (typeof(result)==='object')
          expectSafeObject(result);
      return result;
    }
    throw new Error(`download unimplemented for ${name}`);
  }

  async upload(options){
    if (this.readOnly)
      this.readOnlyError();
    await this.prepUpload(options);
    const {name, blob} = options;
    const doWrite = async (fh)=> {
      const writable = await fh.createWritable();
      await writable.write(blob);
      await writable.close();
    }
    const fh = await dh.getFileHandle(name, {create:true});
    await consensual({handle: fh, op: doWrite, write: true});
    this.manifest.push({name, fh, size: blob.size});
  }
}

export class LocalDB {

  constructor({top}) {
    this.top = top;
    this.initPromise = this.init();
  }

  async init() {
    this.manifest = [];
    for await (const handle of this.top.values()) {
      if (handle.kind==='directory'){
        const dirManifest = [];
        let include = false;
        for await (const innerHandle of handle.values()) {
          if (innerHandle.kind==='file') {
            let size;
            try {
              const blob = await innerHandle.getFile();
              size = blob.size;
            } catch(e){
              console.log(e);
            }
            const name = innerHandle.name;
            console.log({name,size});
            dirManifest.push({name, size, fh:innerHandle});
            if (name==='config.json')
              include = true;
          }
        }
        if (include)
          this.manifest.push(new StudyFolderForFSAccessAPI({
            name: handle.name,
            manifest: dirManifest,
            dh: handle
          }));
      }
    }
    this.ready = true;
  }

  async listStudyFolders(name) {
    if (name===undefined){
      return this.manifest;
    }
    const entry = this.manifest.find((f)=>(f.name===name));
    if (entry)
      return [entry];
    return [];
  }
}

