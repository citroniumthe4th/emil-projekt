'use client'
import { useEffect, useRef, useState } from 'react'

const POV = 'pov' // Emil's id; messages from this person are always "mine" (right side, green)
const COLORS = ['#e542a3', '#1f7aec', '#d3396d', '#c75b00', '#5e47de', '#027eb5', '#a62c71', '#3b8f2a']
const DEFAULT = {
  group: { name: 'Group Chat', photo: '' },
  people: [{ id: POV, name: 'Emil Tischbein', photo: '', color: '#008069' }],
  messages: [],
  sender: POV,
}
const GONE = { name: 'Deleted person', photo: '', color: '#8696a0' }

const now = () => new Date().toTimeString().slice(0, 5)
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

// Downscale before upload: keeps files small and under Vercel's 4.5MB request limit
async function shrink(file, max = 1600) {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))
}

async function upload(file) {
  const fd = new FormData()
  fd.append('file', await shrink(file), 'image.jpg')
  const r = await fetch('/api/upload', { method: 'POST', body: fd })
  if (!r.ok) throw new Error('upload failed')
  return (await r.json()).url
}

function Avatar({ src, name, color = '#8696a0', size = 40 }) {
  if (src) return <img className="avatar" src={src} width={size} height={size} alt="" />
  return (
    <div className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  )
}

function PhotoPicker({ src, name, color, onChange }) {
  const [busy, setBusy] = useState(false)
  async function pick(e) {
    const f = e.target.files[0]
    if (!f) return
    setBusy(true)
    try { onChange(await upload(f)) } catch { alert('Upload failed') }
    setBusy(false)
  }
  return (
    <label className="photo-picker">
      <Avatar src={src} name={name} color={color} size={96} />
      <span>{busy ? 'Uploading…' : 'Change photo'}</span>
      <input type="file" accept="image/*" hidden onChange={pick} />
    </label>
  )
}

function EditModal({ title, item, withColor, onSave, onDelete, onClose }) {
  const [d, setD] = useState(item)
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); onSave(d) }}>
        <h3>{title}</h3>
        <PhotoPicker src={d.photo} name={d.name} color={d.color} onChange={photo => setD({ ...d, photo })} />
        {d.photo && <button type="button" className="link" onClick={() => setD({ ...d, photo: '' })}>Remove photo</button>}
        <input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} placeholder="Name" autoFocus required />
        {withColor && (
          <label className="color">Name color <input type="color" value={d.color} onChange={e => setD({ ...d, color: e.target.value })} /></label>
        )}
        <div className="modal-actions">
          {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Save</button>
        </div>
      </form>
    </div>
  )
}

function MessageEditor({ msg, people, onSave, onCancel }) {
  const [d, setD] = useState(msg)
  return (
    <div className="editor">
      {d.image && (
        <div className="editor-img">
          <img src={d.image} alt="" />
          <button className="link" onClick={() => setD({ ...d, image: '' })}>Remove image</button>
        </div>
      )}
      <textarea value={d.text} onChange={e => setD({ ...d, text: e.target.value })} autoFocus />
      <div className="editor-row">
        <select value={d.from} onChange={e => setD({ ...d, from: e.target.value })}>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="time" value={d.time} onChange={e => setD({ ...d, time: e.target.value })} />
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onSave(d)}>Save</button>
      </div>
    </div>
  )
}

export default function Home() {
  const [s, setS] = useState(null)
  const sRef = useRef(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(null)
  const [modal, setModal] = useState(null)
  const [sending, setSending] = useState(false)
  const queue = useRef(Promise.resolve())
  const bottom = useRef(null)

  useEffect(() => {
    fetch('/api/state')
      .then(r => { if (!r.ok) throw 0; return r.json() })
      .then(d => { sRef.current = d || DEFAULT; setS(sRef.current) })
      .catch(() => alert('Could not load the chat. Reload to try again.')) // never fall back to DEFAULT here: it would overwrite the saved story
  }, [])

  useEffect(() => { bottom.current?.scrollIntoView() }, [s?.messages.length])

  // Apply a change, then save the whole state (saves are queued so they land in order)
  function update(fn) {
    const next = structuredClone(sRef.current)
    fn(next)
    sRef.current = next
    setS(next)
    queue.current = queue.current
      .then(() => fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }))
      .then(r => { if (!r.ok) throw 0 })
      .catch(() => alert('Saving failed — your last change may not be stored.'))
  }

  if (!s) return <div className="loading">Loading…</div>

  const person = id => s.people.find(p => p.id === id) || GONE
  const me = person(s.sender)
  const last = s.messages.at(-1)

  function send(image = '', caption = text) {
    if (!caption.trim() && !image) return
    update(d => d.messages.push({ id: crypto.randomUUID(), from: d.sender, text: caption.trim(), image, time: now() }))
    setText('')
  }

  async function sendImage(e) {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    setSending(true)
    try { send(await upload(f), text) } catch { alert('Upload failed') }
    setSending(false)
  }

  function savePerson(p) {
    update(d => {
      const i = d.people.findIndex(x => x.id === p.id)
      if (i < 0) d.people.push(p)
      else d.people[i] = p
    })
    setModal(null)
  }

  function deletePerson(p) {
    if (!confirm(`Remove ${p.name}? Their messages stay in the chat.`)) return
    update(d => {
      d.people = d.people.filter(x => x.id !== p.id)
      if (d.sender === p.id) d.sender = POV
    })
    setModal(null)
  }

  return (
    <div className="app">
      <aside>
        <header className="side-head">Chats</header>
        <div className="chat-item active" onClick={() => setModal({ kind: 'group' })}>
          <Avatar src={s.group.photo} name={s.group.name} size={49} />
          <div className="chat-info">
            <div className="chat-name">{s.group.name}</div>
            <div className="sub">{last ? `${person(last.from).name}: ${last.text || '📷 Photo'}` : 'No messages yet'}</div>
          </div>
        </div>

        <section className="people">
          <div className="people-head">
            <span>Send as</span>
            <button onClick={() => setModal({ kind: 'person', person: { id: crypto.randomUUID(), name: '', photo: '', color: COLORS[(s.people.length - 1) % COLORS.length] } })}>+ Add person</button>
          </div>
          {s.people.map(p => (
            <div key={p.id} className={`person ${p.id === s.sender ? 'active' : ''}`} onClick={() => update(d => { d.sender = p.id })}>
              <Avatar src={p.photo} name={p.name} color={p.color} size={36} />
              <span className="person-name">{p.name}{p.id === POV && <em> · POV</em>}</span>
              <button className="icon" title="Edit" onClick={e => { e.stopPropagation(); setModal({ kind: 'person', person: p }) }}>✎</button>
            </div>
          ))}
        </section>
      </aside>

      <main>
        <header className="chat-head" onClick={() => setModal({ kind: 'group' })} title="Edit group">
          <Avatar src={s.group.photo} name={s.group.name} />
          <div className="chat-info">
            <div className="chat-name">{s.group.name}</div>
            <div className="sub">{s.people.map(p => (p.id === POV ? 'You' : p.name)).join(', ')}</div>
          </div>
        </header>

        <div className="messages">
          {s.messages.map((m, i) => {
            const p = person(m.from)
            const out = m.from === POV
            const first = i === 0 || s.messages[i - 1].from !== m.from
            return (
              <div key={m.id} className={`row ${out ? 'out' : 'in'} ${first ? 'first' : ''}`}>
                {!out && (first ? <Avatar src={p.photo} name={p.name} color={p.color} size={32} /> : <div className="avatar-space" />)}
                <div className="bubble">
                  {!out && first && <div className="name" style={{ color: p.color }}>{p.name}</div>}
                  {editing === m.id ? (
                    <MessageEditor
                      msg={m}
                      people={s.people}
                      onCancel={() => setEditing(null)}
                      onSave={nm => { update(d => { d.messages[d.messages.findIndex(x => x.id === m.id)] = nm }); setEditing(null) }}
                    />
                  ) : (
                    <>
                      {m.image && <img className="photo" src={m.image} alt="" />}
                      {m.text && <span className="text">{m.text}</span>}
                      <span className="time">{m.time}</span>
                      <div className="actions">
                        <button title="Edit" onClick={() => setEditing(m.id)}>✎</button>
                        <button title="Delete" onClick={() => confirm('Delete this message?') && update(d => { d.messages = d.messages.filter(x => x.id !== m.id) })}>🗑</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottom} />
        </div>

        <footer className="composer">
          <div className="sending-as" title="Change who's sending in the list on the left">
            <Avatar src={me.photo} name={me.name} color={me.color} size={28} />
            <span>{me.name}</span>
          </div>
          <label className="icon" title="Send image">
            {sending ? '…' : '📎'}
            <input type="file" accept="image/*" hidden onChange={sendImage} disabled={sending} />
          </label>
          <textarea
            rows={1}
            value={text}
            placeholder="Type a message"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className="send" onClick={() => send()} title="Send">➤</button>
        </footer>
      </main>

      {modal?.kind === 'group' && (
        <EditModal
          title="Edit group"
          item={s.group}
          onClose={() => setModal(null)}
          onSave={g => { update(d => { d.group = g }); setModal(null) }}
        />
      )}
      {modal?.kind === 'person' && (
        <EditModal
          title={s.people.some(p => p.id === modal.person.id) ? 'Edit person' : 'Add person'}
          item={modal.person}
          withColor
          onClose={() => setModal(null)}
          onSave={savePerson}
          onDelete={modal.person.id !== POV && s.people.some(p => p.id === modal.person.id) ? () => deletePerson(modal.person) : null}
        />
      )}
    </div>
  )
}
