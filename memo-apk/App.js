import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  FlatList, ScrollView, StyleSheet, Animated,
  KeyboardAvoidingView, Platform, StatusBar, Alert, Share, BackHandler,
  NativeModules,
} from 'react-native';

function updateWidget(notes) {
  try {
    if (Platform.OS === 'android' && NativeModules.MemoWidget && notes.length > 0) {
      const last = notes[0];
      NativeModules.MemoWidget.updateWidget(last.text, last.ts);
    }
  } catch {}
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Caveat_400Regular, Caveat_600SemiBold } from '@expo-google-fonts/caveat';
import { InstrumentSans_400Regular, InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans';
// ── Stubs notifications (Expo Go SDK 53+) ──────────────────────────────────
async function scheduleNotif() {}
async function cancelNotif() {}

// ── Couleurs ───────────────────────────────────────────────────────────────
const C = {
  paper:   '#faf8f5',
  paper2:  '#f3f0ea',
  surface: '#ffffff',
  ink:     '#1c1a16',
  ink2:    '#3a3630',
  faint:   '#9a9590',
  faint2:  '#706c66',
  line:    '#e8e4db',
  line2:   '#d4cfc5',
  rust:    '#c85a2a',
  rustBg:  'rgba(200,90,42,0.07)',
  red:     '#b83030',
};

const NOTES_KEY = 'memo_notes_v1';
const BELL_PRESETS = [
  { label: '5 min',  ms: 300000 },
  { label: '30 min', ms: 1800000 },
  { label: '1 h',    ms: 3600000 },
  { label: '6 h',    ms: 21600000 },
  { label: '1 j',    ms: 86400000 },
  { label: '1 sem',  ms: 604800000 },
];
const QUICK_PRESETS = [
  { label: '5 min',  ms: 300000 },
  { label: '30 min', ms: 1800000 },
  { label: '1 h',    ms: 3600000 },
  { label: '1 j',    ms: 86400000 },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function msLabel(ms) {
  const s = ms / 1000;
  if (s < 3600)     return `${Math.round(s / 60)}min`;
  if (s < 86400)    return `${Math.round(s / 3600)}h`;
  if (s < 604800)   return `${Math.round(s / 86400)}j`;
  if (s < 2592000)  return `${Math.round(s / 604800)}sem`;
  return `${Math.round(s / 2592000)}mois`;
}

// ── Icônes texte (pas de SVG — compatible Expo Go) ─────────────────────────
function IcMenu({ size = 20, color = C.ink2 }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'space-evenly', alignItems: 'center' }}>
      {[0,1,2].map(i => (
        <View key={i} style={{ width: size * 0.85, height: 1.8, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}
function IcBack({ size = 20, color = C.ink2 }) {
  return <Text style={{ fontSize: size * 0.9, color, lineHeight: size, width: size, textAlign: 'center' }}>‹</Text>;
}
function IcBell({ size = 18, color = C.faint2 }) {
  return <Text style={{ fontSize: size * 0.9, color, lineHeight: size + 2, width: size + 2, textAlign: 'center' }}>🔔</Text>;
}
function IcTrash({ size = 15, color = C.faint }) {
  return <Text style={{ fontSize: size * 1.1, color, lineHeight: size + 4, width: size + 4, textAlign: 'center' }}>🗑</Text>;
}
function IcMic({ size = 15, color = C.faint2 }) {
  return <Text style={{ fontSize: size * 1.1, color, lineHeight: size + 4, width: size + 4, textAlign: 'center' }}>🎙</Text>;
}
function IcHome({ size = 18, color = C.ink2 }) {
  return <Text style={{ fontSize: size * 0.9, color, lineHeight: size + 2, width: size + 2, textAlign: 'center' }}>⌂</Text>;
}
function IcPen({ size = 18, color = C.ink2 }) {
  return <Text style={{ fontSize: size * 0.85, color, lineHeight: size + 2, width: size + 2, textAlign: 'center' }}>✏</Text>;
}
function IcList({ size = 18, color = C.ink2 }) {
  return <Text style={{ fontSize: size * 0.85, color, lineHeight: size + 2, width: size + 2, textAlign: 'center' }}>≡</Text>;
}
function IcDownload({ size = 15, color = C.ink2 }) {
  return <Text style={{ fontSize: size, color, lineHeight: size + 2, width: size + 2, textAlign: 'center' }}>↓</Text>;
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({
    Caveat_400Regular, Caveat_600SemiBold,
    InstrumentSans_400Regular, InstrumentSans_500Medium,
  });

  const [notes, setNotes]               = useState([]);
  const [screen, setScreen]             = useState('home');
  const [prevScreen, setPrevScreen]     = useState('home');
  const [searchQ, setSearchQ]           = useState('');
  const [menuOpen, setMenuOpen]         = useState(false);
  const [viewNote, setViewNote]         = useState(null);
  const [toastMsg, setToastMsg]         = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);

  const [writeText, setWriteText]           = useState('');
  const [pendingPingMs, setPendingPingMs]   = useState(null);
  const [pendingPingMode, setPendingPingMode] = useState('notif');
  const [bellPanelOpen, setBellPanelOpen]   = useState(false);
  const [quickPingId, setQuickPingId]       = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(NOTES_KEY).then(v => {
      if (v) try { setNotes(JSON.parse(v)); } catch {}
    });
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (bellPanelOpen) { setBellPanelOpen(false); return true; }
      if (menuOpen)      { setMenuOpen(false);       return true; }
      if (quickPingId !== null) { setQuickPingId(null); return true; }
      if (screen !== 'home') { goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  });

  const persist = (next) => AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next));

  const showToast = (msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600);
  };

  const goTo   = (s) => { setPrevScreen(screen); setScreen(s); };
  const goBack = ()  => setScreen(prevScreen === screen ? 'home' : prevScreen);

  const openWrite = () => {
    setWriteText(''); setPendingPingMs(null);
    setPendingPingMode('notif'); setBellPanelOpen(false);
    goTo('write');
  };

  const saveNote = async () => {
    const text = writeText.trim(); if (!text) return;
    const note = { id: Date.now(), ts: Date.now(), text };
    if (pendingPingMs) {
      note.ping        = pendingPingMs;
      note.pingAfter   = pendingPingMode === 'notif' ? 'warn' : pendingPingMode === 'notif-del' ? 'delete' : 'silent-delete';
      note.pingDeadline = Date.now() + pendingPingMs;
    }
    const next = [note, ...notes];
    setNotes(next); persist(next);
    updateWidget(next);
    showToast(note.ping ? 'Mémo enregistré — rappel dans ' + msLabel(note.ping) : 'Mémo enregistré');
    setWriteText(''); setPendingPingMs(null); setPendingPingMode('notif'); setBellPanelOpen(false);
    setScreen('home');
  };

  const deleteNote = async (id) => {
    await cancelNotif(id);
    const next = notes.filter(n => n.id !== id);
    setNotes(next); persist(next);
    updateWidget(next);
    showToast('Mémo supprimé');
    if (screen === 'view') setScreen('list');
  };

  const setPing = (noteId, ms, after) => {
    const next = notes.map(n => {
      if (n.id !== noteId) return n;
      const u = { ...n, ping: ms, pingAfter: after, pingDeadline: Date.now() + ms };
      scheduleNotif(u); return u;
    });
    setNotes(next); persist(next);
    showToast('Rappel dans ' + msLabel(ms));
    setQuickPingId(null);
  };

  const filtered    = searchQ.trim() ? notes.filter(n => n.text.toLowerCase().includes(searchQ.toLowerCase())) : notes;
  const totalChars  = notes.reduce((a, n) => a + n.text.length, 0);

  if (!fontsLoaded) return <View style={{ flex:1, backgroundColor: C.paper }} />;

  const PT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 52;

  return (
    <View style={s.root}>
      <StatusBar backgroundColor={C.paper} barStyle="dark-content" />

      {/* ══ HOME ══════════════════════════════════════════════════════════ */}
      {screen === 'home' && (
        <View style={s.screen}>
          <View style={[s.topBar, { paddingTop: PT }]}>
            <Text style={s.homeLogo}>mémo</Text>
            <TouchableOpacity style={s.iconBtn} onPress={() => setMenuOpen(true)}>
              <IcMenu />
            </TouchableOpacity>
          </View>
          <View style={s.homeBody}>
            <TouchableOpacity style={s.btnNew} onPress={openWrite}>
              <Text style={s.btnNewTxt}>+</Text>
            </TouchableOpacity>
            <Text style={s.homeHint}>nouveau mémo</Text>
          </View>
          <View style={s.homeFooter}>
            {notes.length > 0 ? (
              <TouchableOpacity style={s.lastCard} activeOpacity={0.7}
                onPress={() => { setViewNote(notes[0]); goTo('view'); }}>
                <Text style={s.lastCardMeta}>Dernier mémo · {fmtDate(notes[0].ts)}</Text>
                <Text style={s.lastCardText} numberOfLines={4}>{notes[0].text}</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.lastEmpty}>
                <Text style={s.lastEmptyTxt}>Aucun mémo pour l'instant</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ══ WRITE ═════════════════════════════════════════════════════════ */}
      {screen === 'write' && (
        <View style={s.screen}>
          <View style={[s.topBar, { paddingTop: PT }]}>
            <TouchableOpacity style={s.iconBtn} onPress={() => { setBellPanelOpen(false); setScreen('home'); }}>
              <IcBack />
            </TouchableOpacity>
            <View style={{ flex:1 }} />
            <Text style={s.charCount}>{writeText.length}</Text>
            <TouchableOpacity
              style={[s.btnSave, !writeText.trim() && s.btnSaveOff]}
              onPress={saveNote} disabled={!writeText.trim()}>
              <Text style={s.btnSaveTxt}>Enregistrer</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TextInput
              style={s.noteArea}
              multiline placeholder="Commence à écrire…"
              placeholderTextColor={C.faint}
              value={writeText} onChangeText={setWriteText}
              autoFocus textAlignVertical="top"
            />
            <View style={s.voiceBar}>
              <TouchableOpacity
                style={[s.bellBtn, pendingPingMs && s.bellBtnOn]}
                onPress={() => setBellPanelOpen(v => !v)}>
                <IcBell size={18} color={pendingPingMs ? '#fff' : C.faint2} />
              </TouchableOpacity>
              <TouchableOpacity style={s.voiceBtn}>
                <IcMic size={15} color={C.faint2} />
                <Text style={s.voiceBtnTxt}>Dicter</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>

          {/* Bell panel — bottom sheet */}
          {bellPanelOpen && (
            <TouchableWithoutFeedback onPress={() => setBellPanelOpen(false)}>
              <View style={s.sheetOverlay}>
                <TouchableWithoutFeedback>
                  <View style={s.sheet}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetSection}>DÉLAI</Text>
                    <View style={s.presetsWrap}>
                      {BELL_PRESETS.map(p => (
                        <TouchableOpacity key={p.ms}
                          style={[s.chip, pendingPingMs === p.ms && s.chipOn]}
                          onPress={() => setPendingPingMs(prev => prev === p.ms ? null : p.ms)}>
                          <Text style={[s.chipTxt, pendingPingMs === p.ms && s.chipTxtOn]}>{p.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={s.divider} />
                    <Text style={s.sheetSection}>ACTION</Text>
                    <View style={s.modesWrap}>
                      {[
                        { id:'notif',     label:'Notif seule' },
                        { id:'notif-del', label:'Notif + supprimer' },
                        { id:'del',       label:'Supprimer seul' },
                      ].map(m => (
                        <TouchableOpacity key={m.id}
                          style={[s.modeRow, pendingPingMode === m.id && s.modeRowOn]}
                          onPress={() => setPendingPingMode(m.id)}>
                          <IcBell size={14} color={pendingPingMode === m.id ? C.rust : C.faint2} />
                          <Text style={[s.modeRowTxt, pendingPingMode === m.id && s.modeRowTxtOn]}>{m.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          )}
        </View>
      )}

      {/* ══ LIST ══════════════════════════════════════════════════════════ */}
      {screen === 'list' && (
        <View style={s.screen}>
          <View style={[s.topBar, { paddingTop: PT }]}>
            <TouchableOpacity style={s.iconBtn} onPress={goBack}><IcBack /></TouchableOpacity>
            <Text style={s.barTitle}>Mes mémos</Text>
          </View>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statVal}>{notes.length}</Text>
              <Text style={s.statLbl}>mémos</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statVal}>{totalChars.toLocaleString('fr')}</Text>
              <Text style={s.statLbl}>caractères</Text>
            </View>
          </View>
          <View style={s.searchWrap}>
            <TextInput style={s.searchInput} placeholder="Rechercher…"
              placeholderTextColor={C.faint} value={searchQ} onChangeText={setSearchQ} />
          </View>
          {filtered.length === 0
            ? <Text style={s.listEmpty}>{searchQ ? 'Aucun résultat' : 'Aucun mémo'}</Text>
            : (
              <FlatList data={filtered} keyExtractor={n => String(n.id)}
                contentContainerStyle={{ paddingBottom: 28 }}
                renderItem={({ item: n }) => (
                  <View>
                    <View style={s.noteRow}>
                      <TouchableOpacity style={s.noteCard} activeOpacity={0.7}
                        onPress={() => { setViewNote(n); goTo('view'); }}>
                        <Text style={s.noteCardMeta}>{fmtDate(n.ts)}</Text>
                        <Text style={s.noteCardTxt} numberOfLines={3}>{n.text}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.rowBtn, n.ping && s.rowBellOn]}
                        onPress={() => setQuickPingId(quickPingId === n.id ? null : n.id)}>
                        <IcBell size={14} color={n.ping ? C.rust : C.faint} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.rowBtn}
                        onPress={() => Alert.alert('Supprimer ?', '', [
                          { text:'Annuler', style:'cancel' },
                          { text:'Supprimer', style:'destructive', onPress: () => deleteNote(n.id) },
                        ])}>
                        <IcTrash size={14} color={C.faint} />
                      </TouchableOpacity>
                    </View>
                    {quickPingId === n.id && (
                      <View style={s.quickPop}>
                        {QUICK_PRESETS.map(p => (
                          <TouchableOpacity key={p.ms}
                            style={[s.chip, n.ping === p.ms && s.chipOn]}
                            onPress={() => setPing(n.id, p.ms, n.pingAfter || 'warn')}>
                            <Text style={[s.chipTxt, n.ping === p.ms && s.chipTxtOn]}>{p.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              />
            )
          }
        </View>
      )}

      {/* ══ VIEW ══════════════════════════════════════════════════════════ */}
      {screen === 'view' && viewNote && (
        <View style={s.screen}>
          <View style={[s.topBar, { paddingTop: PT }]}>
            <TouchableOpacity style={s.iconBtn} onPress={goBack}><IcBack /></TouchableOpacity>
            <View style={{ flex:1 }} />
            <TouchableOpacity style={s.outlineBtn}
              onPress={() => Share.share({ message: viewNote.text })}>
              <IcDownload size={13} color={C.ink2} />
              <Text style={s.outlineBtnTxt}>Exporter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.outlineBtn, { borderColor: C.red, marginLeft: 6 }]}
              onPress={() => Alert.alert('Supprimer ?', '', [
                { text:'Annuler', style:'cancel' },
                { text:'Supprimer', style:'destructive', onPress: () => deleteNote(viewNote.id) },
              ])}>
              <Text style={[s.outlineBtnTxt, { color: C.red }]}>Supprimer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.viewContent}>
            <Text style={s.viewMeta}>{fmtDate(viewNote.ts)}</Text>
            <Text style={s.viewBody}>{viewNote.text}</Text>
          </ScrollView>
        </View>
      )}

      {/* ══ MENU ══════════════════════════════════════════════════════════ */}
      {menuOpen && (
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={s.overlay}>
            <TouchableWithoutFeedback>
              <View style={[s.drawer, { paddingTop: PT + 8 }]}>
                <View style={s.drawerHead}>
                  <Text style={s.menuLogo}>mémo</Text>
                  <View style={s.badge}>
                    <Text style={s.badgeTxt}>{notes.length} mémo{notes.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <View style={s.menuItems}>
                  <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); setScreen('home'); }}>
                    <IcHome size={18} color={C.ink2} />
                    <Text style={s.menuItemTxt}>Accueil</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); openWrite(); }}>
                    <IcPen size={18} color={C.ink2} />
                    <Text style={s.menuItemTxt}>Nouveau mémo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); setSearchQ(''); goTo('list'); }}>
                    <IcList size={18} color={C.ink2} />
                    <Text style={s.menuItemTxt}>Tous les mémos</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={s.transferBtn} onPress={() => { setMenuOpen(false); openWrite(); }}>
                  <IcPen size={15} color={C.rust} />
                  <Text style={s.transferBtnTxt}>Transférer en note</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}

      {/* ══ TOAST ═════════════════════════════════════════════════════════ */}
      {toastMsg !== '' && (
        <Animated.View style={[s.toast, { opacity: toastAnim }]}>
          <Text style={s.toastTxt}>{toastMsg}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex:1, backgroundColor: C.paper2 },
  screen: { flex:1, backgroundColor: C.paper },

  topBar: {
    flexDirection:'row', alignItems:'center', gap:8,
    paddingHorizontal:16, paddingBottom:12,
    borderBottomWidth:1, borderBottomColor: C.line,
    backgroundColor: C.surface,
  },
  iconBtn: {
    width:38, height:38, borderRadius:19,
    backgroundColor: C.paper2,
    alignItems:'center', justifyContent:'center',
  },
  homeLogo: { fontFamily:'Caveat_600SemiBold', fontSize:28, color: C.ink, flex:1 },
  barTitle: { fontFamily:'InstrumentSans_500Medium', fontSize:16, color: C.ink, flex:1 },

  homeBody: { flex:1, alignItems:'center', justifyContent:'center', gap:14 },
  btnNew: {
    width:72, height:72, borderRadius:36,
    backgroundColor: C.rust, alignItems:'center', justifyContent:'center',
    elevation:8, shadowColor: C.rust, shadowOffset:{width:0,height:6}, shadowOpacity:.3, shadowRadius:16,
  },
  btnNewTxt: { color:'#fff', fontSize:34, lineHeight:40, fontWeight:'300' },
  homeHint: { fontFamily:'InstrumentSans_400Regular', fontSize:13, color: C.faint },

  homeFooter: { paddingHorizontal:16, paddingBottom:28 },
  lastCard: {
    backgroundColor: C.surface, borderRadius:16, padding:16,
    borderWidth:1, borderColor: C.line,
    shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:.05, shadowRadius:8, elevation:2,
  },
  lastCardMeta: { fontFamily:'InstrumentSans_400Regular', fontSize:11, color: C.faint, marginBottom:8 },
  lastCardText: { fontFamily:'Caveat_400Regular', fontSize:21, color: C.ink2, lineHeight:28 },
  lastEmpty:    { alignItems:'center', paddingVertical:24 },
  lastEmptyTxt: { fontFamily:'InstrumentSans_400Regular', fontSize:13, color: C.faint },

  charCount: { fontFamily:'InstrumentSans_400Regular', fontSize:12, color: C.faint, marginRight:4 },
  btnSave: {
    backgroundColor: C.rust, borderRadius:10,
    paddingHorizontal:16, paddingVertical:8,
  },
  btnSaveOff: { backgroundColor: C.line2 },
  btnSaveTxt: { fontFamily:'InstrumentSans_500Medium', fontSize:13, color:'#fff' },

  noteArea: {
    flex:1, paddingHorizontal:20, paddingTop:20, paddingBottom:20,
    fontFamily:'Caveat_400Regular', fontSize:24, color: C.ink, lineHeight:34,
    backgroundColor: C.paper, textAlignVertical:'top',
  },

  voiceBar: {
    flexDirection:'row', alignItems:'center', gap:8,
    paddingHorizontal:18, paddingTop:8, paddingBottom:20,
    backgroundColor: C.paper,
    borderTopWidth:1, borderTopColor: C.line,
  },
  bellBtn: {
    width:40, height:40, borderRadius:20,
    backgroundColor: C.surface, borderWidth:1.5, borderColor: C.line,
    alignItems:'center', justifyContent:'center',
  },
  bellBtnOn: { backgroundColor: C.rust, borderColor: C.rust },
  voiceBtn: {
    flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6,
    borderWidth:1, borderColor: C.line, borderRadius:10, paddingVertical:10,
    backgroundColor: C.surface,
  },
  voiceBtnTxt: { fontFamily:'InstrumentSans_400Regular', fontSize:13, color: C.ink2 },

  // Bell bottom sheet
  sheetOverlay: {
    position:'absolute', top:0, left:0, right:0, bottom:0,
    backgroundColor:'rgba(0,0,0,0.18)',
    justifyContent:'flex-end',
    zIndex:20,
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius:22, borderTopRightRadius:22,
    paddingTop:12, paddingHorizontal:16, paddingBottom:32,
    borderTopWidth:1, borderTopColor: C.line2,
  },
  sheetHandle: {
    width:36, height:4, borderRadius:2,
    backgroundColor: C.line2, alignSelf:'center', marginBottom:16,
  },
  sheetSection: {
    fontFamily:'InstrumentSans_400Regular', fontSize:10, color: C.faint,
    letterSpacing:1, marginBottom:10,
  },
  presetsWrap: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
  divider: { height:1, backgroundColor: C.line, marginVertical:10 },
  modesWrap: { gap:6 },

  chip: {
    backgroundColor: C.paper2, borderWidth:1, borderColor: C.line,
    borderRadius:20, paddingHorizontal:14, paddingVertical:7,
  },
  chipOn:    { backgroundColor: C.rust, borderColor: C.rust },
  chipTxt:   { fontFamily:'InstrumentSans_400Regular', fontSize:13, color: C.ink2 },
  chipTxtOn: { color:'#fff' },

  modeRow: {
    flexDirection:'row', alignItems:'center', gap:10,
    backgroundColor: C.paper2, borderWidth:1, borderColor: C.line,
    borderRadius:12, paddingHorizontal:12, paddingVertical:10,
  },
  modeRowOn:    { backgroundColor: C.rustBg, borderColor: C.rust },
  modeRowTxt:   { fontFamily:'InstrumentSans_400Regular', fontSize:13, color: C.faint2 },
  modeRowTxtOn: { color: C.rust },

  statsRow: {
    flexDirection:'row', gap:24, paddingHorizontal:20, paddingVertical:12,
    borderBottomWidth:1, borderBottomColor: C.line,
  },
  stat: {},
  statVal: { fontFamily:'Caveat_600SemiBold', fontSize:22, color: C.rust },
  statLbl: { fontFamily:'InstrumentSans_400Regular', fontSize:11, color: C.faint },

  searchWrap: {
    paddingHorizontal:14, paddingVertical:10,
    borderBottomWidth:1, borderBottomColor: C.line,
  },
  searchInput: {
    backgroundColor: C.paper2, borderRadius:12,
    paddingHorizontal:14, paddingVertical:10,
    fontFamily:'InstrumentSans_400Regular', fontSize:14, color: C.ink,
    borderWidth:1, borderColor: C.line,
  },
  listEmpty: {
    fontFamily:'InstrumentSans_400Regular', fontSize:14, color: C.faint,
    textAlign:'center', marginTop:40,
  },
  noteRow: {
    flexDirection:'row', alignItems:'center',
    marginHorizontal:14, marginTop:10,
  },
  noteCard: {
    flex:1, backgroundColor: C.surface, borderRadius:14, padding:14,
    borderWidth:1, borderColor: C.line, marginRight:8,
  },
  noteCardMeta: { fontFamily:'InstrumentSans_400Regular', fontSize:11, color: C.faint, marginBottom:6 },
  noteCardTxt:  { fontFamily:'Caveat_400Regular', fontSize:20, color: C.ink2, lineHeight:27 },
  rowBtn: {
    width:32, height:32, borderRadius:16,
    backgroundColor: C.paper2, alignItems:'center', justifyContent:'center', marginLeft:4,
  },
  rowBellOn: { backgroundColor: C.rustBg, borderWidth:1.5, borderColor: C.rust },
  quickPop: {
    flexDirection:'row', flexWrap:'wrap', gap:6,
    marginHorizontal:14, marginTop:6,
    backgroundColor: C.surface, borderWidth:1, borderColor: C.line2,
    borderRadius:14, padding:10,
  },

  viewContent: { padding:20, paddingBottom:48 },
  viewMeta: { fontFamily:'InstrumentSans_400Regular', fontSize:12, color: C.faint, marginBottom:16 },
  viewBody: { fontFamily:'Caveat_400Regular', fontSize:24, color: C.ink, lineHeight:34 },
  outlineBtn: {
    flexDirection:'row', alignItems:'center', gap:5,
    borderWidth:1, borderColor: C.line2, borderRadius:10,
    paddingHorizontal:11, paddingVertical:7,
  },
  outlineBtnTxt: { fontFamily:'InstrumentSans_400Regular', fontSize:13, color: C.ink2 },

  overlay: {
    position:'absolute', top:0, left:0, right:0, bottom:0,
    backgroundColor:'rgba(0,0,0,0.22)', zIndex:50,
  },
  drawer: {
    position:'absolute', top:0, left:0, bottom:0,
    width:'78%', maxWidth:300,
    backgroundColor: C.surface,
    paddingHorizontal:20, paddingBottom:32,
  },
  drawerHead: {
    flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    marginBottom:24, paddingBottom:16, borderBottomWidth:1, borderBottomColor: C.line,
  },
  menuLogo: { fontFamily:'Caveat_600SemiBold', fontSize:26, color: C.ink },
  badge: {
    backgroundColor: C.paper2, borderRadius:20,
    paddingHorizontal:10, paddingVertical:4,
    borderWidth:1, borderColor: C.line,
  },
  badgeTxt: { fontFamily:'InstrumentSans_400Regular', fontSize:11, color: C.faint2 },
  menuItems: { gap:2 },
  menuItem: {
    flexDirection:'row', alignItems:'center', gap:14,
    paddingVertical:13, paddingHorizontal:8, borderRadius:10,
  },
  menuItemTxt: { fontFamily:'InstrumentSans_500Medium', fontSize:15, color: C.ink2 },
  transferBtn: {
    flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8,
    backgroundColor: C.rustBg, borderWidth:1, borderColor: C.rust,
    borderRadius:14, paddingVertical:13, marginTop:20,
  },
  transferBtnTxt: { fontFamily:'InstrumentSans_500Medium', fontSize:14, color: C.rust },

  toast: {
    position:'absolute', bottom:40, alignSelf:'center',
    backgroundColor: C.ink, paddingHorizontal:16, paddingVertical:9,
    borderRadius:20, zIndex:100,
  },
  toastTxt: { fontFamily:'InstrumentSans_400Regular', fontSize:13, color:'#fff' },
});
