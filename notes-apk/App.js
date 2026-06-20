import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@notes_vivlio_v1';

// ---------- Helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function titleOf(note) {
  const firstLine = (note.text || '').trim().split('\n')[0];
  if (firstLine) return firstLine.slice(0, 60);
  return 'Note sans titre';
}

function previewOf(note) {
  const lines = (note.text || '').trim().split('\n');
  const rest = lines.slice(1).join(' ').trim();
  return rest.slice(0, 80);
}

// ---------- App ----------

export default function App() {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // note object or null
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setNotes(parsed);
        }
      } catch (e) {
        // start empty on read error
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist whenever notes change (after initial load)
  const persist = useCallback(async (next) => {
    setNotes(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      Alert.alert('Erreur', "Impossible d'enregistrer la note.");
    }
  }, []);

  // ----- Actions -----

  function openNew() {
    setEditing({ id: uid(), text: '', created: Date.now(), updated: Date.now(), isNew: true });
    setDraft('');
  }

  function openNote(note) {
    setEditing(note);
    setDraft(note.text);
  }

  function saveDraft() {
    const text = draft.trim();
    if (!editing) return;

    // Empty note: discard instead of saving
    if (!text) {
      if (!editing.isNew) {
        // existing note emptied -> delete it
        persist(notes.filter((n) => n.id !== editing.id));
      }
      setEditing(null);
      setDraft('');
      return;
    }

    const now = Date.now();
    const exists = notes.some((n) => n.id === editing.id);
    let next;
    if (exists) {
      next = notes.map((n) =>
        n.id === editing.id ? { ...n, text, updated: now } : n
      );
    } else {
      next = [{ id: editing.id, text, created: editing.created, updated: now }, ...notes];
    }
    // keep most-recently-updated first
    next.sort((a, b) => b.updated - a.updated);
    persist(next);
    setEditing(null);
    setDraft('');
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  function deleteNote(note) {
    Alert.alert('Supprimer', 'Supprimer cette note ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          persist(notes.filter((n) => n.id !== note.id));
          if (editing && editing.id === note.id) cancelEdit();
        },
      },
    ]);
  }

  // ----- Derived -----

  const filtered = query.trim()
    ? notes.filter((n) =>
        (n.text || '').toLowerCase().includes(query.trim().toLowerCase())
      )
    : notes;

  // ----- Render: Editor -----

  if (editing) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={styles.editorBar}>
          <TouchableOpacity
            style={styles.barBtn}
            activeOpacity={0.6}
            onPress={cancelEdit}
          >
            <Text style={styles.barBtnText}>‹ Retour</Text>
          </TouchableOpacity>
          <View style={styles.barRight}>
            {!editing.isNew && (
              <TouchableOpacity
                style={styles.barBtn}
                activeOpacity={0.6}
                onPress={() => deleteNote(editing)}
              >
                <Text style={styles.barBtnText}>Suppr.</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.barBtn, styles.barBtnPrimary]}
              activeOpacity={0.6}
              onPress={saveDraft}
            >
              <Text style={[styles.barBtnText, styles.barBtnPrimaryText]}>
                Enregistrer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <TextInput
          style={styles.editor}
          value={draft}
          onChangeText={setDraft}
          placeholder={'Écris ta note ici…\n\n(la première ligne devient le titre)'}
          placeholderTextColor="#999999"
          multiline
          autoFocus
          textAlignVertical="top"
          underlineColorAndroid="transparent"
          selectionColor="#000000"
        />
      </SafeAreaView>
    );
  }

  // ----- Render: List -----

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.header}>
        <Text style={styles.appTitle}>Notes</Text>
        <Text style={styles.count}>{notes.length}</Text>
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher…"
        placeholderTextColor="#999999"
        underlineColorAndroid="transparent"
        selectionColor="#000000"
      />

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {loaded
              ? notes.length === 0
                ? 'Aucune note.\nAppuie sur + pour commencer.'
                : 'Aucun résultat.'
              : 'Chargement…'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.6}
              onPress={() => openNote(item)}
              onLongPress={() => deleteNote(item)}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>
                {titleOf(item)}
              </Text>
              {previewOf(item) ? (
                <Text style={styles.cardPreview} numberOfLines={2}>
                  {previewOf(item)}
                </Text>
              ) : null}
              <Text style={styles.cardDate}>{formatDate(item.updated)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.7} onPress={openNew}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------- Styles (e-ink: pure black/white, no shadows, hard borders) ----------

const BORDER = 2;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: BORDER,
    borderBottomColor: '#000000',
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  count: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },

  // Search
  search: {
    margin: 16,
    marginBottom: 8,
    borderWidth: BORDER,
    borderColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    color: '#000000',
    backgroundColor: '#ffffff',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  card: {
    borderWidth: BORDER,
    borderColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  cardPreview: {
    fontSize: 16,
    color: '#333333',
    marginBottom: 8,
    lineHeight: 22,
  },
  cardDate: {
    fontSize: 13,
    color: '#000000',
    fontWeight: '600',
    opacity: 0.7,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#000000',
    textAlign: 'center',
    lineHeight: 28,
  },

  // FAB (new note)
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#000000',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#ffffff',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '300',
  },

  // Editor
  editorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: BORDER,
    borderBottomColor: '#000000',
  },
  barRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 8,
    borderWidth: BORDER,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
  },
  barBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  barBtnPrimary: {
    backgroundColor: '#000000',
  },
  barBtnPrimaryText: {
    color: '#ffffff',
  },
  editor: {
    flex: 1,
    padding: 20,
    fontSize: 20,
    lineHeight: 30,
    color: '#000000',
    backgroundColor: '#ffffff',
  },
});
