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
  const [summaries, setSummaries] = useState({});
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('count');
  const [goal, setGoal] = useState('');
  const [timers, setTimers] = useState({});

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await getTasks();
      setTasks(data);
      // Load summaries for each task
      const summaryPromises = data.map(task => getSummary(task.id));
      const summaryResults = await Promise.all(summaryPromises);
      const summaryMap = {};
      data.forEach((task, index) => {
        summaryMap[task.id] = summaryResults[index];
      });
      setSummaries(summaryMap);
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

  const handleIncrement = async (taskId, value = 1) => {
    try {
      await createEvent(taskId, { type: 'increment', value });
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const handleTimerStart = async (taskId) => {
    try {
      await createEvent(taskId, { type: 'timer_start' });
      setTimers(prev => ({ ...prev, [taskId]: Date.now() }));
    } catch (error) {
      Alert.alert('Error', 'Failed to start timer');
    }
  };

  const handleTimerStop = async (taskId) => {
    try {
      const startTime = timers[taskId];
      const duration = Math.floor((Date.now() - startTime) / 1000);
      await createEvent(taskId, { type: 'timer_stop', value: duration });
      setTimers(prev => ({ ...prev, [taskId]: null }));
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to stop timer');
    }
  };

  const handleCheck = async (taskId) => {
    try {
      await createEvent(taskId, { type: 'check' });
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to check task');
    }
  };

  const renderTask = ({ item }) => {
    const summary = summaries[item.id] || {};
    const isTimerRunning = timers[item.id];
    
    return (
      <View style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <Text style={styles.taskName}>{item.name}</Text>
          <TouchableOpacity onPress={() => handleDeleteTask(item.id)} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.taskMeta}>{item.metric} • Goal: {item.goal || 'None'}</Text>
        
        {/* Progress Display */}
        {item.metric === 'count' && (
          <Text style={styles.progress}>Progress: {summary.total || 0}/{item.goal || '∞'}</Text>
        )}
        {item.metric === 'timer' && (
          <Text style={styles.progress}>Time: {Math.floor((summary.total_sec || 0) / 60)}min/{item.goal || '∞'}min</Text>
        )}
        {item.metric === 'check' && (
          <Text style={styles.progress}>{summary.done ? '✅ Done' : '⏳ Pending'}</Text>
        )}
        
        {/* Action Buttons */}
        {item.metric === 'count' && (
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={() => handleIncrement(item.id, 1)} style={[styles.actionBtn, styles.buttonSpacing]}>
              <Text style={styles.actionText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleIncrement(item.id, 5)} style={[styles.actionBtn, styles.buttonSpacing]}>
              <Text style={styles.actionText}>+5</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleIncrement(item.id, 10)} style={styles.actionBtn}>
              <Text style={styles.actionText}>+10</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {item.metric === 'timer' && (
          <TouchableOpacity 
            onPress={() => isTimerRunning ? handleTimerStop(item.id) : handleTimerStart(item.id)} 
            style={[styles.actionBtn, isTimerRunning && styles.stopBtn]}
          >
            <Text style={styles.actionText}>{isTimerRunning ? 'Stop' : 'Start'}</Text>
          </TouchableOpacity>
        )}
        
        {item.metric === 'check' && !summary.done && (
          <TouchableOpacity onPress={() => handleCheck(item.id)} style={styles.actionBtn}>
            <Text style={styles.actionText}>Mark Done</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

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
        <View style={styles.pickerContainer}>
          {METRICS.map(m => (
            <TouchableOpacity 
              key={m.value} 
              onPress={() => setMetric(m.value)}
              style={[styles.metricBtn, metric === m.value && styles.metricBtnActive]}
            >
              <Text style={[styles.metricText, metric === m.value && styles.metricTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder={metric === 'timer' ? 'Goal (minutes)' : 'Goal (optional)'}
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
  progress: { color: '#666', fontSize: 14, marginVertical: 4, fontWeight: '500' },
  buttonRow: { flexDirection: 'row', marginTop: 8 },
  actionBtn: { backgroundColor: '#10b981', padding: 8, borderRadius: 4, marginTop: 8, flex: 1 },
  buttonSpacing: { marginRight: 8 },
  stopBtn: { backgroundColor: '#ef4444' },
  actionText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  pickerContainer: { flexDirection: 'row', marginBottom: 8 },
  metricBtn: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#ddd', marginRight: 4, borderRadius: 4 },
  metricBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  metricText: { textAlign: 'center', color: '#666' },
  metricTextActive: { color: 'white' }
});