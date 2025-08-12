import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { getTasks, createTask, deleteTask, createEvent, getSummary } from './api';

const METRICS = [
  { value: 'count', label: 'Count' },
  { value: 'timer', label: 'Timer' },
  { value: 'check', label: 'Check' }
];

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('count');
  const [goal, setGoal] = useState('');

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await getTasks();
      setTasks(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load tasks');
    }
  };

  const handleCreateTask = async () => {
    if (!name.trim()) return;
    try {
      await createTask({
        name: name.trim(),
        metric,
        goal: goal ? Number(goal) : null,
        color: '#6366F1'
      });
      setName('');
      setGoal('');
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to create task');
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      await deleteTask(id);
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete task');
    }
  };

  const handleIncrement = async (taskId) => {
    try {
      await createEvent(taskId, { type: 'increment', value: 1 });
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const renderTask = ({ item }) => (
    <View style={styles.taskCard}>
      <View style={styles.taskHeader}>
        <Text style={styles.taskName}>{item.name}</Text>
        <TouchableOpacity onPress={() => handleDeleteTask(item.id)} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.taskMeta}>{item.metric} • Goal: {item.goal || 'None'}</Text>
      {item.metric === 'count' && (
        <TouchableOpacity onPress={() => handleIncrement(item.id)} style={styles.actionBtn}>
          <Text style={styles.actionText}>+1</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Task Metrics</Text>
      
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Task name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Goal (optional)"
          value={goal}
          onChangeText={setGoal}
          keyboardType="numeric"
        />
        <TouchableOpacity onPress={handleCreateTask} style={styles.createBtn}>
          <Text style={styles.createText}>Create Task</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={item => item.id}
        style={styles.taskList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  form: { backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 4, marginBottom: 8 },
  createBtn: { backgroundColor: '#6366F1', padding: 12, borderRadius: 4 },
  createText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  taskList: { flex: 1 },
  taskCard: { backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 8 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskName: { fontSize: 16, fontWeight: 'bold' },
  taskMeta: { color: '#666', fontSize: 12, marginVertical: 4 },
  deleteBtn: { padding: 4 },
  deleteText: { color: '#ef4444', fontSize: 16 },
  actionBtn: { backgroundColor: '#10b981', padding: 8, borderRadius: 4, marginTop: 8 },
  actionText: { color: 'white', textAlign: 'center', fontWeight: 'bold' }
});