const tools = [
  {name:'PDF to Word',desc:'Make PDFs editable again.',icon:'W',color:'#edf4ff',ink:'#4e83c8',kind:'convert'},
  {name:'Word to PDF',desc:'Share a polished final copy.',icon:'D',color:'#edf4ff',ink:'#4e83c8',kind:'convert'},
  {name:'PDF to JPG',desc:'Pages, ready for anywhere.',icon:'▧',color:'#fff3e9',ink:'#e5964d',kind:'convert'},
  {name:'JPG to PDF',desc:'Bring images into one file.',icon:'▧',color:'#fff3e9',ink:'#e5964d',kind:'convert'},
  {name:'Merge PDF',desc:'Make one from many.',icon:'⊕',color:'#eff1ff',ink:'#727bed',kind:'organize'},
  {name:'Split PDF',desc:'Extract selected pages.',icon:'⫿',color:'#eff1ff',ink:'#727bed',kind:'organize'},
  {name:'Delete Pages',desc:'Remove selected pages.',icon:'−',color:'#eff1ff',ink:'#727bed',kind:'organize'},
  {name:'Reorder Pages',desc:'Set pages in a new order.',icon:'↕',color:'#eff1ff',ink:'#727bed',kind:'organize'},
  {name:'Compress PDF',desc:'Smaller files, same quality.',icon:'⌑',color:'#f1f6e8',ink:'#79a340',kind:'optimize'},
  {name:'Rotate PDF',desc:'Get every page facing right.',icon:'↻',color:'#f3efff',ink:'#8870dc',kind:'organize'},
  {name:'Protect PDF',desc:'Add a layer of security.',icon:'⌑',color:'#fff0ef',ink:'#df7569',kind:'secure'},
  {name:'Unlock PDF',desc:'Remove a PDF password.',icon:'⌑',color:'#fff0ef',ink:'#df7569',kind:'secure'},
  {name:'Organize PDF',desc:'Put pages in their place.',icon:'⠿',color:'#eff1ff',ink:'#727bed',kind:'organize'},
  {name:'Add Watermark',desc:'Make every page yours.',icon:'◈',color:'#f3efff',ink:'#8870dc',kind:'edit'},
  {name:'Page Numbers',desc:'Keep long docs in order.',icon:'#',color:'#f3efff',ink:'#8870dc',kind:'edit'},
  {name:'Excel to PDF',desc:'Turn sheets into snapshots.',icon:'X',color:'#edf6ef',ink:'#5d9a6b',kind:'convert'},
  {name:'PPT to PDF',desc:'Presentations, preserved.',icon:'P',color:'#fff1e9',ink:'#df8050',kind:'convert'}
];
const grid = document.querySelector('#tool-grid');
const search = document.querySelector('#tool-search');
const noResults = document.querySelector('.no-results');
const dialog = document.querySelector('#tool-dialog');
const dialogOptions = dialog.querySelector('.dialog-options');
const dialogNotice = dialog.querySelector('.dialog-notice span:last-child');
const processButton = dialog.querySelector('.dialog-cta');
const optionPages = dialog.querySelector('[name="pages"]');
const optionRotation = dialog.querySelector('[name="rotation"]');
const optionWatermark = dialog.querySelector('[name="watermark"]');
let activeTool = null;
function renderTools(query='') {
  const filtered = tools.filter(tool => `${tool.name} ${tool.desc} ${tool.kind}`.toLowerCase().includes(query.toLowerCase()));
  grid.innerHTML = filtered.map((tool,index) => `<button class="tool-card" style="animation-delay:${Math.min(index*24,240)}ms" data-tool="${tool.name}"><span class="tool-arrow">↗</span><span class="tool-icon" style="background:${tool.color};color:${tool.ink}">${tool.icon}</span><strong>${tool.name}</strong><p>${tool.desc}</p></button>`).join('');
  noResults.hidden = filtered.length > 0;
}
renderTools();
search.addEventListener('input', () => renderTools(search.value));
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); }
  if (event.key === 'Escape' && dialog.open) dialog.close();
});
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-tool]');
  if (!trigger) return;
  const tool = tools.find(item => item.name === trigger.dataset.tool);
  if (!tool) return;
  activeTool = tool.name;
  dialog.querySelector('.dialog-icon').style.background = tool.color;
  dialog.querySelector('.dialog-icon').style.color = tool.ink;
  dialog.querySelector('.dialog-icon').textContent = tool.icon;
  dialog.querySelector('h2').textContent = tool.name;
  dialog.querySelector('p').textContent = tool.desc + ' Configure your options, then process your file.';
  const supportsPdfOptions = ['Split PDF','Delete Pages','Reorder Pages','Organize PDF','Rotate PDF','Add Watermark','Page Numbers'].includes(tool.name);
  dialogOptions.hidden = !supportsPdfOptions;
  dialog.querySelector('.option-pages').hidden = !['Split PDF','Delete Pages','Reorder Pages','Organize PDF'].includes(tool.name);
  optionPages.placeholder = tool.name === 'Delete Pages' ? 'Pages to remove (e.g. 2,4-5)' : tool.name === 'Reorder Pages' ? 'New order (e.g. 3,1,2)' : 'Pages to extract (e.g. 1,3-5)';
  dialog.querySelector('.option-rotation').hidden = tool.name !== 'Rotate PDF';
  dialog.querySelector('.option-watermark').hidden = tool.name !== 'Add Watermark';
  optionPages.value = '';
  optionWatermark.value = '';
  processButton.innerHTML = files.size ? 'Process selected files <span>↗</span>' : 'Choose files <span>↑</span>';
  dialogNotice.textContent = files.size ? `${files.size} file${files.size === 1 ? '' : 's'} selected. Files are processed temporarily and not stored.` : 'Choose file(s) in the workspace, then run this tool. Files are processed temporarily and not stored.';
  dialog.showModal();
});
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
processButton.addEventListener('click', () => {
  if (!files.size) { input.click(); return; }
  processTool();
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

const zone = document.querySelector('#dropzone');
const input = document.querySelector('#file-input');
const fileList = document.querySelector('.file-list');
const status = document.querySelector('.upload-status');
const maxSize = 25 * 1024 * 1024;
const accepted = new Set(['pdf','doc','docx','jpg','jpeg','png','xls','xlsx','ppt','pptx']);
const files = new Map();
function formatSize(size) { return size < 1024*1024 ? `${Math.max(1,Math.round(size/1024))} KB` : `${(size/1024/1024).toFixed(1)} MB`; }
function renderFiles() {
  fileList.innerHTML = [...files].map(([id,file]) => `<div class="selected-file"><span class="file-badge">${file.name.split('.').pop().slice(0,4).toUpperCase()}</span><span class="file-name" title="${file.name.replaceAll('"','&quot;')}">${file.name.replaceAll('<','&lt;')}</span><span class="file-size">${formatSize(file.size)}</span><button class="remove-file" data-remove="${id}" aria-label="Remove ${file.name.replaceAll('"','')}">×</button></div>`).join('');
}
function addFiles(selected) {
  const errors=[];
  for (const file of selected) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!accepted.has(ext)) { errors.push(`${file.name}: unsupported file type.`); continue; }
    if (file.size > maxSize) { errors.push(`${file.name}: file exceeds 100 MB.`); continue; }
    const id = `${file.name}-${file.size}-${Math.random()}`;
    files.set(id,file);
  }
  renderFiles();
  status.textContent = errors.length ? errors.join(' ') : files.size ? `${files.size} file${files.size===1?'':'s'} ready. Choose a tool to process.` : '';
  if (dialog.open && activeTool) {
    dialogNotice.textContent = files.size ? `${files.size} file${files.size === 1 ? '' : 's'} selected. Files are processed temporarily and not stored.` : 'No files selected.';
    processButton.innerHTML = files.size ? 'Process selected files <span>↗</span>' : 'Choose files <span>↑</span>';
  }
}
zone.addEventListener('click', event => { if (event.target.closest('.remove-file')) return; input.click(); });
zone.addEventListener('keydown', event => { if (event.key==='Enter'||event.key===' ') { event.preventDefault(); input.click(); } });
document.querySelector('.browse-button').addEventListener('click', event => { event.stopPropagation(); input.click(); });
input.addEventListener('change', () => { addFiles(input.files); input.value=''; });
for (const name of ['dragenter','dragover']) zone.addEventListener(name,event => { event.preventDefault(); zone.classList.add('dragging'); });
for (const name of ['dragleave','drop']) zone.addEventListener(name,event => { event.preventDefault(); zone.classList.remove('dragging'); });
zone.addEventListener('drop',event => addFiles(event.dataTransfer.files));
fileList.addEventListener('click',event => { const button=event.target.closest('[data-remove]'); if(button){files.delete(button.dataset.remove);renderFiles();status.textContent=files.size?`${files.size} file${files.size===1?'':'s'} ready. Choose a tool to process.`:''; if(dialog.open&&activeTool){dialogNotice.textContent=files.size?`${files.size} file${files.size===1?'':'s'} selected. Files are processed temporarily and not stored.`:'No files selected.';processButton.innerHTML=files.size?'Process selected files <span>↗</span>':'Choose files <span>↑</span>';}} });

async function processTool() {
  processButton.disabled = true;
  processButton.textContent = 'Uploading and processing…';
  dialogNotice.textContent = 'Processing on this server. Please keep this window open.';
  status.textContent = `Processing ${activeTool}…`;
  const body = new FormData();
  for (const file of files.values()) body.append('files', file, file.name);
  if (optionPages.value.trim()) body.append('pages', optionPages.value.trim());
  if (activeTool === 'Rotate PDF') body.append('rotation', optionRotation.value);
  if (activeTool === 'Add Watermark') body.append('text', optionWatermark.value);
  try {
    const response = await fetch(`/api/process/${encodeURIComponent(activeTool)}`, { method: 'POST', body });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Processing failed (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    if (blob.size < 8 || blob.type !== 'application/pdf') throw new Error('The server returned an invalid PDF. No download was created.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'pdf-forge-result.pdf';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = `${activeTool} complete. Your download has started.`;
    dialogNotice.textContent = 'Processing complete. Your PDF download has started.';
    files.clear(); renderFiles();
    processButton.textContent = 'Done';
  } catch (error) {
    dialogNotice.textContent = error.message || 'Processing failed. Check your file and try again.';
    status.textContent = error.message || 'Processing failed. Check your file and try again.';
  } finally {
    processButton.disabled = false;
    if (files.size) processButton.innerHTML = 'Try again <span>↗</span>';
  }
}
const menuButton=document.querySelector('.mobile-menu');
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));document.querySelector('.main-nav').classList.toggle('open',open);});
document.querySelectorAll('.main-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelector('.main-nav').classList.remove('open');menuButton.setAttribute('aria-expanded','false');}));
