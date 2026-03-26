import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { format } from 'date-fns';

interface UnassignedLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  created_date: string;
}

interface AgentAssignment {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  assigned_leads: number;
  created_leads: number;
  total_leads: number;
  territories: string[];
  workload_score: number;
}

interface Territory {
  id: string;
  name: string;
  description: string;
  geographic_type: string;
  zip_codes: string[];
  cities: string[];
  counties: string[];
  states: string[];
  assigned_agents: string[];
  agent_names: string[];
  lead_count: number;
}

const DISTRIBUTION_METHODS = [
  { id: 'round_robin', name: 'Round Robin', description: 'Distribute evenly in order', icon: 'sync-circle' },
  { id: 'workload_balanced', name: 'Workload Balanced', description: 'Give more to agents with fewer leads', icon: 'scale' },
  { id: 'territory_based', name: 'Territory Based', description: 'Match leads to agent territories', icon: 'location' },
];

export default function LeadDistributionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unassignedLeads, setUnassignedLeads] = useState<UnassignedLead[]>([]);
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [activeTab, setActiveTab] = useState<'unassigned' | 'agents' | 'territories'>('unassigned');
  
  // Selection state
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  
  // Modals
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [distributeModalVisible, setDistributeModalVisible] = useState(false);
  const [territoryModalVisible, setTerritoryModalVisible] = useState(false);
  const [distributionMethod, setDistributionMethod] = useState('round_robin');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // New territory form
  const [newTerritory, setNewTerritory] = useState({
    name: '',
    description: '',
    geographic_type: 'zip_codes',
    zip_codes: '',
  });

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }
    
    try {
      const [unassigned, assignmentData, territoriesData] = await Promise.all([
        api.getUnassignedLeads(),
        api.getLeadAssignments(),
        api.getTerritories(),
      ]);
      setUnassignedLeads(unassigned);
      setAssignments(assignmentData);
      setTerritories(territoriesData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to access lead distribution');
        router.back();
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    );
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
    );
  };

  const selectAllLeads = () => {
    if (selectedLeads.length === unassignedLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(unassignedLeads.map(l => l.id));
    }
  };

  const handleAssignToAgent = async (agentId: string) => {
    if (selectedLeads.length === 0) {
      Alert.alert('No Leads Selected', 'Please select leads to assign');
      return;
    }
    
    setIsProcessing(true);
    try {
      await api.bulkAssignLeads(selectedLeads, agentId);
      Alert.alert('Success', `${selectedLeads.length} leads assigned`);
      setSelectedLeads([]);
      setAssignModalVisible(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to assign leads');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoDistribute = async () => {
    if (selectedLeads.length === 0) {
      Alert.alert('No Leads Selected', 'Please select leads to distribute');
      return;
    }
    if (selectedAgents.length === 0) {
      Alert.alert('No Agents Selected', 'Please select agents to receive leads');
      return;
    }
    
    setIsProcessing(true);
    try {
      const result = await api.autoDistributeLeads(selectedLeads, selectedAgents, distributionMethod);
      Alert.alert('Distribution Complete', result.message);
      setSelectedLeads([]);
      setSelectedAgents([]);
      setDistributeModalVisible(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to distribute leads');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateTerritory = async () => {
    if (!newTerritory.name.trim()) {
      Alert.alert('Error', 'Please enter a territory name');
      return;
    }
    
    setIsProcessing(true);
    try {
      const zipCodes = newTerritory.zip_codes
        .split(',')
        .map(z => z.trim())
        .filter(z => z.length > 0);
      
      await api.createTerritory({
        name: newTerritory.name,
        description: newTerritory.description,
        geographic_type: newTerritory.geographic_type,
        zip_codes: zipCodes,
        assigned_agents: selectedAgents,
      });
      
      Alert.alert('Success', 'Territory created');
      setNewTerritory({ name: '', description: '', geographic_type: 'zip_codes', zip_codes: '' });
      setSelectedAgents([]);
      setTerritoryModalVisible(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to create territory');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTerritory = async (territoryId: string) => {
    Alert.alert(
      'Delete Territory',
      'Are you sure you want to delete this territory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteTerritory(territoryId);
              loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete territory');
            }
          },
        },
      ]
    );
  };

  if (!isManagerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            Lead Distribution is only available to Managers and Admins.
          </Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading lead distribution...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lead Distribution</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setTerritoryModalVisible(true)}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { id: 'unassigned', label: `Unassigned (${unassignedLeads.length})`, icon: 'people' },
          { id: 'agents', label: 'Agents', icon: 'person' },
          { id: 'territories', label: 'Territories', icon: 'map' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.id ? '#3B82F6' : '#64748B'}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action Bar for Unassigned tab */}
      {activeTab === 'unassigned' && selectedLeads.length > 0 && (
        <View style={styles.actionBar}>
          <Text style={styles.selectedCount}>{selectedLeads.length} selected</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setAssignModalVisible(true)}
            >
              <Ionicons name="person-add" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Assign</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={() => setDistributeModalVisible(true)}
            >
              <Ionicons name="shuffle" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Auto-Distribute</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {activeTab === 'unassigned' && (
          <>
            {/* Select All */}
            {unassignedLeads.length > 0 && (
              <TouchableOpacity style={styles.selectAllButton} onPress={selectAllLeads}>
                <Ionicons
                  name={selectedLeads.length === unassignedLeads.length ? 'checkbox' : 'square-outline'}
                  size={20}
                  color="#3B82F6"
                />
                <Text style={styles.selectAllText}>
                  {selectedLeads.length === unassignedLeads.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            )}

            {unassignedLeads.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
                <Text style={styles.emptyText}>All leads are assigned!</Text>
              </View>
            ) : (
              unassignedLeads.map((lead) => (
                <TouchableOpacity
                  key={lead.id}
                  style={[styles.leadCard, selectedLeads.includes(lead.id) && styles.leadCardSelected]}
                  onPress={() => toggleLeadSelection(lead.id)}
                >
                  <Ionicons
                    name={selectedLeads.includes(lead.id) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selectedLeads.includes(lead.id) ? '#3B82F6' : '#64748B'}
                  />
                  <View style={styles.leadInfo}>
                    <Text style={styles.leadName}>{lead.name}</Text>
                    <Text style={styles.leadContact}>{lead.phone || lead.email}</Text>
                    {lead.address && <Text style={styles.leadAddress}>{lead.address}</Text>}
                    <Text style={styles.leadMeta}>
                      Source: {lead.source || 'Unknown'} • {format(new Date(lead.created_date), 'MMM d')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === 'agents' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Agent Workload</Text>
            {assignments.map((agent) => (
              <View key={agent.agent_id} style={styles.agentCard}>
                <View style={styles.agentHeader}>
                  <View style={styles.agentAvatar}>
                    <Text style={styles.agentAvatarText}>
                      {agent.agent_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.agentInfo}>
                    <Text style={styles.agentName}>{agent.agent_name}</Text>
                    <Text style={styles.agentEmail}>{agent.agent_email}</Text>
                    {agent.territories.length > 0 && (
                      <View style={styles.territoryBadges}>
                        {agent.territories.slice(0, 2).map((t, i) => (
                          <View key={i} style={styles.territoryBadge}>
                            <Text style={styles.territoryBadgeText}>{t}</Text>
                          </View>
                        ))}
                        {agent.territories.length > 2 && (
                          <Text style={styles.moreText}>+{agent.territories.length - 2}</Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.agentStats}>
                  <View style={styles.agentStatItem}>
                    <Text style={styles.agentStatValue}>{agent.assigned_leads}</Text>
                    <Text style={styles.agentStatLabel}>Assigned</Text>
                  </View>
                  <View style={styles.agentStatItem}>
                    <Text style={styles.agentStatValue}>{agent.created_leads}</Text>
                    <Text style={styles.agentStatLabel}>Created</Text>
                  </View>
                  <View style={styles.agentStatItem}>
                    <Text style={[styles.agentStatValue, { color: '#22C55E' }]}>{agent.total_leads}</Text>
                    <Text style={styles.agentStatLabel}>Total</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'territories' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Territories ({territories.length})</Text>
            {territories.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="map-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No territories defined</Text>
                <Text style={styles.emptySubtext}>Tap + to create a territory</Text>
              </View>
            ) : (
              territories.map((territory) => (
                <View key={territory.id} style={styles.territoryCard}>
                  <View style={styles.territoryHeader}>
                    <View>
                      <Text style={styles.territoryName}>{territory.name}</Text>
                      {territory.description && (
                        <Text style={styles.territoryDescription}>{territory.description}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteTerritory(territory.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.territoryDetails}>
                    <View style={styles.territoryDetailItem}>
                      <Ionicons name="location" size={14} color="#64748B" />
                      <Text style={styles.territoryDetailText}>
                        {territory.geographic_type === 'zip_codes' 
                          ? `${territory.zip_codes.length} zip codes`
                          : territory.geographic_type}
                      </Text>
                    </View>
                    <View style={styles.territoryDetailItem}>
                      <Ionicons name="people" size={14} color="#64748B" />
                      <Text style={styles.territoryDetailText}>
                        {territory.agent_names.length} agents
                      </Text>
                    </View>
                    <View style={styles.territoryDetailItem}>
                      <Ionicons name="person" size={14} color="#64748B" />
                      <Text style={styles.territoryDetailText}>
                        {territory.lead_count} leads
                      </Text>
                    </View>
                  </View>
                  
                  {territory.agent_names.length > 0 && (
                    <View style={styles.territoryAgents}>
                      <Text style={styles.territoryAgentsLabel}>Assigned to:</Text>
                      <Text style={styles.territoryAgentsText}>
                        {territory.agent_names.join(', ')}
                      </Text>
                    </View>
                  )}
                  
                  {territory.zip_codes.length > 0 && (
                    <View style={styles.zipCodesList}>
                      {territory.zip_codes.slice(0, 5).map((zc, i) => (
                        <View key={i} style={styles.zipCodeBadge}>
                          <Text style={styles.zipCodeText}>{zc}</Text>
                        </View>
                      ))}
                      {territory.zip_codes.length > 5 && (
                        <Text style={styles.moreText}>+{territory.zip_codes.length - 5} more</Text>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Assign to Agent Modal */}
      <Modal visible={assignModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign to Agent</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Assign {selectedLeads.length} lead(s) to an agent
            </Text>
            <ScrollView style={styles.agentList}>
              {assignments.map((agent) => (
                <TouchableOpacity
                  key={agent.agent_id}
                  style={styles.agentOption}
                  onPress={() => handleAssignToAgent(agent.agent_id)}
                  disabled={isProcessing}
                >
                  <View style={styles.agentOptionInfo}>
                    <Text style={styles.agentOptionName}>{agent.agent_name}</Text>
                    <Text style={styles.agentOptionWorkload}>
                      {agent.total_leads} leads currently
                    </Text>
                  </View>
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#64748B" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Auto-Distribute Modal */}
      <Modal visible={distributeModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto-Distribute Leads</Text>
              <TouchableOpacity onPress={() => setDistributeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Distribute {selectedLeads.length} lead(s) automatically
            </Text>
            
            <Text style={styles.inputLabel}>Distribution Method</Text>
            {DISTRIBUTION_METHODS.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodOption,
                  distributionMethod === method.id && styles.methodOptionSelected,
                ]}
                onPress={() => setDistributionMethod(method.id)}
              >
                <Ionicons
                  name={method.icon as any}
                  size={20}
                  color={distributionMethod === method.id ? '#3B82F6' : '#64748B'}
                />
                <View style={styles.methodInfo}>
                  <Text style={[
                    styles.methodName,
                    distributionMethod === method.id && styles.methodNameSelected,
                  ]}>
                    {method.name}
                  </Text>
                  <Text style={styles.methodDescription}>{method.description}</Text>
                </View>
                {distributionMethod === method.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                )}
              </TouchableOpacity>
            ))}
            
            <Text style={styles.inputLabel}>Select Agents ({selectedAgents.length} selected)</Text>
            <ScrollView style={styles.agentCheckList}>
              {assignments.map((agent) => (
                <TouchableOpacity
                  key={agent.agent_id}
                  style={styles.agentCheckItem}
                  onPress={() => toggleAgentSelection(agent.agent_id)}
                >
                  <Ionicons
                    name={selectedAgents.includes(agent.agent_id) ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selectedAgents.includes(agent.agent_id) ? '#3B82F6' : '#64748B'}
                  />
                  <Text style={styles.agentCheckName}>{agent.agent_name}</Text>
                  <Text style={styles.agentCheckWorkload}>{agent.total_leads} leads</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <TouchableOpacity
              style={[styles.distributeButton, isProcessing && styles.buttonDisabled]}
              onPress={handleAutoDistribute}
              disabled={isProcessing || selectedAgents.length === 0}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.distributeButtonText}>
                  Distribute to {selectedAgents.length} Agent(s)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Territory Modal */}
      <Modal visible={territoryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Territory</Text>
              <TouchableOpacity onPress={() => setTerritoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Territory Name</Text>
            <TextInput
              style={styles.textInput}
              value={newTerritory.name}
              onChangeText={(text) => setNewTerritory(prev => ({ ...prev, name: text }))}
              placeholder="e.g., North Dallas"
              placeholderTextColor="#64748B"
            />
            
            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={newTerritory.description}
              onChangeText={(text) => setNewTerritory(prev => ({ ...prev, description: text }))}
              placeholder="Describe this territory"
              placeholderTextColor="#64748B"
            />
            
            <Text style={styles.inputLabel}>Zip Codes (comma separated)</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={newTerritory.zip_codes}
              onChangeText={(text) => setNewTerritory(prev => ({ ...prev, zip_codes: text }))}
              placeholder="75001, 75002, 75003"
              placeholderTextColor="#64748B"
              multiline
            />
            
            <Text style={styles.inputLabel}>Assign to Agents</Text>
            <ScrollView style={styles.agentCheckList}>
              {assignments.map((agent) => (
                <TouchableOpacity
                  key={agent.agent_id}
                  style={styles.agentCheckItem}
                  onPress={() => toggleAgentSelection(agent.agent_id)}
                >
                  <Ionicons
                    name={selectedAgents.includes(agent.agent_id) ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selectedAgents.includes(agent.agent_id) ? '#3B82F6' : '#64748B'}
                  />
                  <Text style={styles.agentCheckName}>{agent.agent_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <TouchableOpacity
              style={[styles.createButton, isProcessing && styles.buttonDisabled]}
              onPress={handleCreateTerritory}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.createButtonText}>Create Territory</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  accessDeniedTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  accessDeniedText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  goBackButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  goBackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    padding: 8,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#3B82F620',
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
  },
  selectedCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonSecondary: {
    backgroundColor: '#8B5CF6',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  selectAllText: {
    color: '#3B82F6',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 4,
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  leadCardSelected: {
    backgroundColor: '#3B82F620',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  leadContact: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  leadAddress: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  leadMeta: {
    color: '#475569',
    fontSize: 11,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  agentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  agentAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  agentEmail: {
    color: '#94A3B8',
    fontSize: 12,
  },
  territoryBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  territoryBadge: {
    backgroundColor: '#22C55E20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  territoryBadgeText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '500',
  },
  moreText: {
    color: '#64748B',
    fontSize: 11,
    alignSelf: 'center',
  },
  agentStats: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 10,
  },
  agentStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  agentStatValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  agentStatLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  territoryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  territoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  territoryName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  territoryDescription: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  deleteButton: {
    padding: 4,
  },
  territoryDetails: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  territoryDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  territoryDetailText: {
    color: '#64748B',
    fontSize: 12,
  },
  territoryAgents: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  territoryAgentsLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  territoryAgentsText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  zipCodesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  zipCodeBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  zipCodeText: {
    color: '#E2E8F0',
    fontSize: 11,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  textInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  agentList: {
    maxHeight: 300,
  },
  agentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  agentOptionInfo: {
    flex: 1,
  },
  agentOptionName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  agentOptionWorkload: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  methodOptionSelected: {
    borderColor: '#3B82F6',
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  methodNameSelected: {
    color: '#3B82F6',
  },
  methodDescription: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  agentCheckList: {
    maxHeight: 200,
  },
  agentCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 12,
  },
  agentCheckName: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  agentCheckWorkload: {
    color: '#64748B',
    fontSize: 12,
  },
  distributeButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  distributeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
