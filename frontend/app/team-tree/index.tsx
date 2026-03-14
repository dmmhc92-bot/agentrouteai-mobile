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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface TreeNode {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  territory?: string;
  lead_count: number;
  production_total: number;
  commission_total: number;
  team_count: number;
  last_login?: string;
  activity_status: string;
  activity_color: string;
  children: TreeNode[];
}

interface TreeData {
  tree: TreeNode[];
  summary: {
    total_users: number;
    total_agents: number;
    total_managers: number;
    total_admins: number;
  };
  viewer_role: string;
  viewer_id: string;
}

const ROLE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  admin: { color: '#8B5CF6', icon: 'shield', label: 'Admin' },
  manager: { color: '#3B82F6', icon: 'people', label: 'Manager' },
  agent: { color: '#22C55E', icon: 'person', label: 'Agent' },
  group: { color: '#64748B', icon: 'folder', label: 'Group' },
};

// Tree Node Component
const TreeNodeComponent: React.FC<{
  node: TreeNode;
  level: number;
  onPress: (node: TreeNode) => void;
  expandedNodes: Set<string>;
  toggleExpand: (nodeId: string) => void;
}> = ({ node, level, onPress, expandedNodes, toggleExpand }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const roleConfig = ROLE_CONFIG[node.role] || ROLE_CONFIG.agent;
  
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  return (
    <View style={styles.nodeWrapper}>
      {/* Connection Line */}
      {level > 0 && (
        <View style={[styles.connectionLine, { left: (level - 1) * 20 + 16 }]} />
      )}
      
      <View style={[styles.nodeContainer, { marginLeft: level * 20 }]}>
        <TouchableOpacity
          style={styles.nodeCard}
          onPress={() => onPress(node)}
          activeOpacity={0.7}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => toggleExpand(node.id)}
            >
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={18}
                color="#64748B"
              />
            </TouchableOpacity>
          )}
          
          {/* Avatar */}
          <View style={[styles.nodeAvatar, { backgroundColor: roleConfig.color }]}>
            <Ionicons name={roleConfig.icon as any} size={18} color="#FFFFFF" />
            {node.activity_status !== 'group' && (
              <View style={[styles.activityIndicator, { backgroundColor: node.activity_color }]} />
            )}
          </View>
          
          {/* Info */}
          <View style={styles.nodeInfo}>
            <View style={styles.nodeNameRow}>
              <Text style={styles.nodeName} numberOfLines={1}>{node.name}</Text>
              <View style={[styles.roleBadge, { backgroundColor: roleConfig.color + '20' }]}>
                <Text style={[styles.roleBadgeText, { color: roleConfig.color }]}>
                  {roleConfig.label}
                </Text>
              </View>
            </View>
            
            {node.role !== 'group' && (
              <Text style={styles.nodeEmail} numberOfLines={1}>{node.email}</Text>
            )}
            
            {/* Stats Row */}
            <View style={styles.nodeStats}>
              {node.team_count > 0 && (
                <View style={styles.nodeStat}>
                  <Ionicons name="people" size={12} color="#64748B" />
                  <Text style={styles.nodeStatText}>{node.team_count}</Text>
                </View>
              )}
              <View style={styles.nodeStat}>
                <Ionicons name="person-add" size={12} color="#64748B" />
                <Text style={styles.nodeStatText}>{node.lead_count}</Text>
              </View>
              <View style={styles.nodeStat}>
                <Ionicons name="cash" size={12} color="#22C55E" />
                <Text style={[styles.nodeStatText, { color: '#22C55E' }]}>
                  {formatCurrency(node.production_total)}
                </Text>
              </View>
            </View>
          </View>
          
          {/* Chevron */}
          {node.role !== 'group' && (
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          )}
        </TouchableOpacity>
      </View>
      
      {/* Children */}
      {hasChildren && isExpanded && (
        <View style={styles.childrenContainer}>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              onPress={onPress}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export default function TeamTreeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [treeData, setTreeData] = useState<TreeData | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const { isLoading: authLoading } = useAuth();
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }
    
    try {
      const data = await api.getTeamTree();
      setTreeData(data);
      
      // Auto-expand first level
      const firstLevelIds = new Set<string>();
      data.tree.forEach((node: TreeNode) => {
        firstLevelIds.add(node.id);
      });
      setExpandedNodes(firstLevelIds);
    } catch (error: any) {
      console.error('Error loading team tree:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view the team tree');
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

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        allIds.add(node.id);
        if (node.children) {
          collectIds(node.children);
        }
      });
    };
    if (treeData) {
      collectIds(treeData.tree);
    }
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleNodePress = (node: TreeNode) => {
    if (node.role === 'group' || node.id === 'unassigned') {
      return;
    }
    router.push(`/command-center/${node.id}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (authLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (!isManagerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            The Team Tree is only available to Managers and Admins.
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
          <Text style={styles.loadingText}>Building team hierarchy...</Text>
        </View>
      </View>
    );
  }

  const totalProduction = treeData?.tree.reduce((sum, node) => {
    const calcTotal = (n: TreeNode): number => {
      let total = n.production_total;
      n.children?.forEach((child) => {
        total += calcTotal(child);
      });
      return total;
    };
    return sum + calcTotal(node);
  }, 0) || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Team Hierarchy</Text>
          {treeData && (
            <Text style={styles.headerSubtitle}>
              {treeData.summary.total_users} members
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={expandAll} style={styles.headerAction}>
            <Ionicons name="expand" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={collapseAll} style={styles.headerAction}>
            <Ionicons name="contract" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Card */}
      {treeData && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="shield" size={16} color="#8B5CF6" />
              </View>
              <View>
                <Text style={styles.summaryValue}>{treeData.summary.total_admins}</Text>
                <Text style={styles.summaryLabel}>Admins</Text>
              </View>
            </View>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="people" size={16} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.summaryValue}>{treeData.summary.total_managers}</Text>
                <Text style={styles.summaryLabel}>Managers</Text>
              </View>
            </View>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#22C55E20' }]}>
                <Ionicons name="person" size={16} color="#22C55E" />
              </View>
              <View>
                <Text style={styles.summaryValue}>{treeData.summary.total_agents}</Text>
                <Text style={styles.summaryLabel}>Agents</Text>
              </View>
            </View>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="cash" size={16} color="#F59E0B" />
              </View>
              <View>
                <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
                  {formatCurrency(totalProduction)}
                </Text>
                <Text style={styles.summaryLabel}>Production</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.legendText}>Online</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Today</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>Recent</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Inactive</Text>
        </View>
      </View>

      {/* Tree View */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {treeData && treeData.tree.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="git-network-outline" size={64} color="#64748B" />
            <Text style={styles.emptyText}>No team members found</Text>
          </View>
        ) : (
          treeData?.tree.map((node) => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              level={0}
              onPress={handleNodePress}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
            />
          ))
        )}
      </ScrollView>
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
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    padding: 8,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#64748B',
    fontSize: 11,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 16,
  },
  nodeWrapper: {
    position: 'relative',
  },
  connectionLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#334155',
  },
  nodeContainer: {
    marginBottom: 8,
  },
  nodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
  },
  expandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  nodeAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  activityIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  nodeInfo: {
    flex: 1,
    marginRight: 8,
  },
  nodeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  nodeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  nodeEmail: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },
  nodeStats: {
    flexDirection: 'row',
    gap: 12,
  },
  nodeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nodeStatText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  childrenContainer: {
    marginTop: 0,
  },
});
