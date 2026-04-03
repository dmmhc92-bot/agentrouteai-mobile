import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface FeedPost {
  id: string;
  content: string;
  post_type: string;
  is_pinned: boolean;
  author_id: string;
  author_name: string;
  author_role: string;
  author_image?: string;
  linked_lead_id?: string;
  linked_lead_name?: string;
  linked_lead_stage?: string;
  comment_count: number;
  reactions: { [key: string]: number };
  user_reaction?: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
}

interface Comment {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role: string;
  author_image?: string;
  created_at: string;
  edited: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  profile_image?: string;
}

const POST_TYPES = [
  { id: 'all', label: 'All Posts', icon: 'list' },
  { id: 'update', label: 'Updates', icon: 'megaphone' },
  { id: 'announcement', label: 'Announcements', icon: 'notifications' },
  { id: 'question', label: 'Questions', icon: 'help-circle' },
  { id: 'progress', label: 'Progress', icon: 'trending-up' },
  { id: 'activity', label: 'Activity', icon: 'pulse' },
];

const REACTION_TYPES = [
  { id: 'like', emoji: '👍', label: 'Like' },
  { id: 'celebrate', emoji: '🎉', label: 'Celebrate' },
  { id: 'support', emoji: '💪', label: 'Support' },
  { id: 'insightful', emoji: '💡', label: 'Insightful' },
];

export default function TeamFeedScreen() {
  const { user, token, isSoloMode } = useAuth();
  const router = useRouter();
  
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  // Filters
  const [selectedType, setSelectedType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  
  // New Post
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostType, setNewPostType] = useState('update');
  const [posting, setPosting] = useState(false);
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(null);
  const [linkedLeadName, setLinkedLeadName] = useState<string | null>(null);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [availableLeads, setAvailableLeads] = useState<{id: string; name: string; stage: string}[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  
  // Comments Modal
  const [showComments, setShowComments] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  
  // WebSocket connection
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  
  // Auto-refresh interval (fallback when WS is not connected)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosts = useCallback(async (isRefresh = false, loadMore = false) => {
    if (!token) return;
    
    try {
      if (!loadMore) {
        if (!isRefresh) setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const currentOffset = loadMore ? offset : 0;
      const params = new URLSearchParams({
        limit: '20',
        offset: currentOffset.toString(),
      });
      
      if (selectedType !== 'all') {
        params.append('filter_type', selectedType);
      }
      if (selectedMember) {
        params.append('filter_user_id', selectedMember);
      }
      
      const response = await api.get(`/feed?${params.toString()}`);
      const data = response.data;
      
      if (loadMore) {
        setPosts(prev => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      
      setHasMore(data.posts.length === 20);
      setOffset(loadMore ? currentOffset + 20 : 20);
      
    } catch (error: any) {
      console.error('Error fetching feed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [token, selectedType, selectedMember, offset]);

  const fetchTeamMembers = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.get('/feed/team-members');
      setTeamMembers(response.data.members || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  }, [token]);

  // WebSocket connection handler
  const connectWebSocket = useCallback(() => {
    if (!token || isSoloMode || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Construct WebSocket URL - get from app config for production builds
    const extraUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL;
    const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    const backendUrl = extraUrl || envUrl || (typeof window !== 'undefined' ? window.location?.origin : '');
    const wsUrl = backendUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    const fullWsUrl = `${wsUrl}/api/ws/feed?token=${token}`;

    console.log('[WebSocket] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(fullWsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Clear polling interval when WebSocket is connected
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Received:', message.type);

          switch (message.type) {
            case 'connected':
              console.log('[WebSocket] Connection confirmed');
              break;

            case 'new_post':
              // Add new post to the top of the feed
              const newPost = message.data as FeedPost;
              setPosts(prev => {
                // Avoid duplicates
                if (prev.some(p => p.id === newPost.id)) {
                  return prev;
                }
                // Insert pinned posts at top of pinned section, others after pinned
                if (newPost.is_pinned) {
                  return [newPost, ...prev];
                }
                const pinnedIndex = prev.findIndex(p => !p.is_pinned);
                if (pinnedIndex === -1) {
                  return [...prev, newPost];
                }
                return [...prev.slice(0, pinnedIndex), newPost, ...prev.slice(pinnedIndex)];
              });
              break;

            case 'new_comment':
              // Update comment count on the post
              const commentData = message.data;
              setPosts(prev => prev.map(p => 
                p.id === commentData.post_id 
                  ? { ...p, comment_count: (p.comment_count || 0) + 1 }
                  : p
              ));
              // If viewing this post's comments, add the new comment
              if (selectedPost?.id === commentData.post_id) {
                setComments(prev => {
                  if (prev.some(c => c.id === commentData.id)) {
                    return prev;
                  }
                  return [...prev, commentData];
                });
              }
              break;

            case 'reaction_update':
              // Refresh reactions on the post - trigger a refetch for accuracy
              const reactionData = message.data;
              // Simple approach: refetch the post's current state
              fetchPosts(true);
              break;

            case 'pong':
              // Heartbeat response received
              break;

            default:
              console.log('[WebSocket] Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('[WebSocket] Error parsing message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setWsConnected(false);
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        setWsConnected(false);
        wsRef.current = null;

        // Start polling fallback
        if (!refreshIntervalRef.current) {
          refreshIntervalRef.current = setInterval(() => {
            fetchPosts(true);
          }, 30000);
        }

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };

      wsRef.current = ws;

      // Send heartbeat every 25 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 25000);

      // Clean up heartbeat on close
      ws.addEventListener('close', () => {
        clearInterval(heartbeatInterval);
      });

    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setWsConnected(false);
    }
  }, [token, isSoloMode, fetchPosts, selectedPost]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setWsConnected(false);
  }, []);

  useEffect(() => {
    fetchPosts();
    fetchTeamMembers();
    
    // Connect to WebSocket for real-time updates
    connectWebSocket();
    
    // Fallback polling (only runs if WebSocket is not connected)
    if (!wsConnected) {
      refreshIntervalRef.current = setInterval(() => {
        fetchPosts(true);
      }, 30000);
    }
    
    return () => {
      disconnectWebSocket();
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [selectedType, selectedMember]);

  const handleRefresh = () => {
    setRefreshing(true);
    setOffset(0);
    fetchPosts(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPosts(false, true);
    }
  };

  const fetchLeadsForLinking = useCallback(async () => {
    if (!token) return;
    setLoadingLeads(true);
    try {
      const response = await api.get('/leads?limit=100');
      const leads = response.data.map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        stage: lead.stage || 'new'
      }));
      setAvailableLeads(leads);
    } catch (error) {
      console.error('Error fetching leads for linking:', error);
    } finally {
      setLoadingLeads(false);
    }
  }, [token]);

  const handleOpenLeadPicker = () => {
    fetchLeadsForLinking();
    setShowLeadPicker(true);
  };

  const handleSelectLead = (lead: {id: string; name: string; stage: string}) => {
    setLinkedLeadId(lead.id);
    setLinkedLeadName(lead.name);
    setShowLeadPicker(false);
    setLeadSearchQuery('');
  };

  const handleRemoveLinkedLead = () => {
    setLinkedLeadId(null);
    setLinkedLeadName(null);
  };

  const filteredLeads = availableLeads.filter(lead =>
    lead.name.toLowerCase().includes(leadSearchQuery.toLowerCase())
  );

  const handleCreatePost = async () => {
    // Prevent double submission
    if (posting) return;
    
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Please enter some content');
      return;
    }
    
    setPosting(true);
    try {
      const postData: any = {
        content: newPostContent.trim(),
        post_type: newPostType,
      };
      
      if (linkedLeadId) {
        postData.linked_lead_id = linkedLeadId;
      }
      
      const response = await api.post('/feed', postData);
      const newPost = response.data;
      
      // Add new post to the top, but check for duplicates first
      setPosts(prev => {
        // Check if post already exists (from WebSocket or previous add)
        if (prev.some(p => p.id === newPost.id)) {
          return prev;
        }
        return [newPost, ...prev];
      });
      
      // Clear form
      setNewPostContent('');
      setNewPostType('update');
      setLinkedLeadId(null);
      setLinkedLeadName(null);
      setShowNewPost(false);
      
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  const handleReaction = async (postId: string, reactionType: string) => {
    try {
      const response = await api.post(`/feed/${postId}/reactions`, {
        reaction_type: reactionType,
      });
      
      // Update local state
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          const newReactions = { ...post.reactions };
          
          if (response.data.action === 'removed') {
            // Decrement old reaction
            if (post.user_reaction && newReactions[post.user_reaction]) {
              newReactions[post.user_reaction]--;
              if (newReactions[post.user_reaction] === 0) {
                delete newReactions[post.user_reaction];
              }
            }
            return { ...post, reactions: newReactions, user_reaction: undefined };
          } else if (response.data.action === 'updated') {
            // Decrement old, increment new
            if (post.user_reaction && newReactions[post.user_reaction]) {
              newReactions[post.user_reaction]--;
              if (newReactions[post.user_reaction] === 0) {
                delete newReactions[post.user_reaction];
              }
            }
            newReactions[reactionType] = (newReactions[reactionType] || 0) + 1;
            return { ...post, reactions: newReactions, user_reaction: reactionType };
          } else {
            // Added new reaction
            newReactions[reactionType] = (newReactions[reactionType] || 0) + 1;
            return { ...post, reactions: newReactions, user_reaction: reactionType };
          }
        }
        return post;
      }));
    } catch (error: any) {
      console.error('Error adding reaction:', error);
    }
  };

  const handleOpenComments = async (post: FeedPost) => {
    setSelectedPost(post);
    setShowComments(true);
    setLoadingComments(true);
    
    try {
      const response = await api.get(`/feed/${post.id}/comments`);
      setComments(response.data.comments || []);
    } catch (error: any) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedPost) return;
    
    setPostingComment(true);
    try {
      const response = await api.post(`/feed/${selectedPost.id}/comments`, {
        content: newComment.trim(),
      });
      
      setComments(prev => [...prev, response.data]);
      setNewComment('');
      
      // Update comment count in posts list
      setPosts(prev => prev.map(p => 
        p.id === selectedPost.id 
          ? { ...p, comment_count: p.comment_count + 1 }
          : p
      ));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/feed/${postId}`);
              setPosts(prev => prev.filter(p => p.id !== postId));
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const handlePinPost = async (postId: string, isPinned: boolean) => {
    try {
      await api.put(`/feed/${postId}`, { is_pinned: !isPinned });
      setPosts(prev => prev.map(p => 
        p.id === postId ? { ...p, is_pinned: !isPinned } : p
      ).sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to pin/unpin post');
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getPostTypeIcon = (type: string) => {
    const typeConfig = POST_TYPES.find(t => t.id === type);
    return typeConfig?.icon || 'document-text';
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return '#EF4444';
      case 'manager': return '#F59E0B';
      case 'agent': return '#3B82F6';
      default: return '#64748B';
    }
  };

  const canModerate = user?.role === 'admin' || user?.role === 'manager';

  // Solo mode message
  if (isSoloMode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Team Feed</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color="#475569" />
          <Text style={styles.emptyTitle}>Team Feed Unavailable</Text>
          <Text style={styles.emptyText}>
            Team Feed is available when you join a team organization.
            Connect with a team to access collaborative features.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderPost = ({ item: post }: { item: FeedPost }) => (
    <View style={[styles.postCard, post.is_pinned && styles.pinnedPost]}>
      {post.is_pinned && (
        <View style={styles.pinnedBadge}>
          <Ionicons name="pin" size={12} color="#F59E0B" />
          <Text style={styles.pinnedText}>Pinned</Text>
        </View>
      )}
      
      <View style={styles.postHeader}>
        <View style={styles.authorInfo}>
          <View style={[styles.avatar, { backgroundColor: getRoleBadgeColor(post.author_role) }]}>
            <Text style={styles.avatarText}>
              {post.author_name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.authorDetails}>
            <Text style={styles.authorName}>{post.author_name}</Text>
            <View style={styles.postMeta}>
              <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(post.author_role) }]}>
                <Text style={styles.roleText}>{post.author_role}</Text>
              </View>
              <Text style={styles.timestamp}>{formatTimeAgo(post.created_at)}</Text>
              {post.edited && <Text style={styles.editedText}>(edited)</Text>}
            </View>
          </View>
        </View>
        
        <View style={styles.postActions}>
          <View style={styles.postTypeBadge}>
            <Ionicons name={getPostTypeIcon(post.post_type) as any} size={12} color="#94A3B8" />
          </View>
          
          {(post.author_id === user?.id || canModerate) && (
            <TouchableOpacity
              onPress={() => {
                const options = [];
                if (canModerate) {
                  options.push({
                    text: post.is_pinned ? 'Unpin' : 'Pin',
                    onPress: () => handlePinPost(post.id, post.is_pinned),
                  });
                }
                if (post.author_id === user?.id || canModerate) {
                  options.push({
                    text: 'Delete',
                    style: 'destructive' as const,
                    onPress: () => handleDeletePost(post.id),
                  });
                }
                options.push({ text: 'Cancel', style: 'cancel' as const });
                Alert.alert('Post Options', '', options);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <Text style={styles.postContent}>{post.content}</Text>
      
      {post.linked_lead_id && (
        <TouchableOpacity 
          style={styles.linkedLead}
          onPress={() => router.push(`/lead/${post.linked_lead_id}`)}
        >
          <Ionicons name="link" size={14} color="#3B82F6" />
          <Text style={styles.linkedLeadText}>
            {post.linked_lead_name || 'View Lead'}
          </Text>
          {post.linked_lead_stage && (
            <View style={styles.leadStageBadge}>
              <Text style={styles.leadStageText}>{post.linked_lead_stage}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
      
      <View style={styles.postFooter}>
        <View style={styles.reactions}>
          {REACTION_TYPES.map(reaction => {
            const count = post.reactions[reaction.id] || 0;
            const isActive = post.user_reaction === reaction.id;
            
            return (
              <TouchableOpacity
                key={reaction.id}
                style={[styles.reactionButton, isActive && styles.reactionActive]}
                onPress={() => handleReaction(post.id, reaction.id)}
              >
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                {count > 0 && <Text style={styles.reactionCount}>{count}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
        
        <TouchableOpacity 
          style={styles.commentButton}
          onPress={() => handleOpenComments(post)}
        >
          <Ionicons name="chatbubble-outline" size={18} color="#64748B" />
          <Text style={styles.commentCount}>{post.comment_count}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Team Feed</Text>
          {wsConnected && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons 
              name={showFilters ? 'filter' : 'filter-outline'} 
              size={22} 
              color={showFilters ? '#3B82F6' : '#94A3B8'} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.newPostButton}
            onPress={() => setShowNewPost(true)}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
      
      {showFilters && (
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {POST_TYPES.map(type => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.filterChip,
                  selectedType === type.id && styles.filterChipActive
                ]}
                onPress={() => {
                  setSelectedType(type.id);
                  setOffset(0);
                }}
              >
                <Ionicons 
                  name={type.icon as any} 
                  size={14} 
                  color={selectedType === type.id ? '#FFFFFF' : '#94A3B8'} 
                />
                <Text style={[
                  styles.filterChipText,
                  selectedType === type.id && styles.filterChipTextActive
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbox-outline" size={64} color="#475569" />
          <Text style={styles.emptyTitle}>No Posts Yet</Text>
          <Text style={styles.emptyText}>
            Be the first to share an update with your team!
          </Text>
          <TouchableOpacity 
            style={styles.emptyButton}
            onPress={() => setShowNewPost(true)}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Create Post</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
              colors={['#3B82F6']}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color="#3B82F6" />
              </View>
            ) : null
          }
        />
      )}
      
      {/* New Post Modal */}
      <Modal
        visible={showNewPost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewPost(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowNewPost(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Post</Text>
            <TouchableOpacity 
              onPress={handleCreatePost}
              disabled={posting || !newPostContent.trim()}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Text style={[
                  styles.postButton,
                  !newPostContent.trim() && styles.postButtonDisabled
                ]}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelector}>
            {POST_TYPES.filter(t => t.id !== 'all').map(type => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeChip,
                  newPostType === type.id && styles.typeChipActive
                ]}
                onPress={() => setNewPostType(type.id)}
              >
                <Ionicons 
                  name={type.icon as any} 
                  size={16} 
                  color={newPostType === type.id ? '#FFFFFF' : '#94A3B8'} 
                />
                <Text style={[
                  styles.typeChipText,
                  newPostType === type.id && styles.typeChipTextActive
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <TextInput
            style={styles.postInput}
            placeholder="Share an update with your team..."
            placeholderTextColor="#64748B"
            multiline
            value={newPostContent}
            onChangeText={setNewPostContent}
            autoFocus
          />
          
          {/* Lead Linking Section */}
          <View style={styles.leadLinkSection}>
            {linkedLeadId ? (
              <View style={styles.linkedLeadPreview}>
                <View style={styles.linkedLeadInfo}>
                  <Ionicons name="link" size={16} color="#3B82F6" />
                  <Text style={styles.linkedLeadPreviewText}>{linkedLeadName}</Text>
                </View>
                <TouchableOpacity onPress={handleRemoveLinkedLead}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.linkLeadButton}
                onPress={handleOpenLeadPicker}
              >
                <Ionicons name="link-outline" size={18} color="#3B82F6" />
                <Text style={styles.linkLeadButtonText}>Link a Lead</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
      
      {/* Lead Picker Modal */}
      <Modal
        visible={showLeadPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLeadPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowLeadPicker(false)}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Lead</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <View style={styles.leadSearchContainer}>
            <Ionicons name="search" size={18} color="#64748B" />
            <TextInput
              style={styles.leadSearchInput}
              placeholder="Search leads..."
              placeholderTextColor="#64748B"
              value={leadSearchQuery}
              onChangeText={setLeadSearchQuery}
            />
          </View>
          
          {loadingLeads ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : (
            <FlatList
              data={filteredLeads}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.leadPickerList}
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyCommentsText}>No leads found</Text>
                </View>
              }
              renderItem={({ item: lead }) => (
                <TouchableOpacity
                  style={styles.leadPickerItem}
                  onPress={() => handleSelectLead(lead)}
                >
                  <View style={styles.leadPickerAvatar}>
                    <Text style={styles.leadPickerAvatarText}>
                      {lead.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.leadPickerInfo}>
                    <Text style={styles.leadPickerName}>{lead.name}</Text>
                    <View style={styles.leadPickerStageBadge}>
                      <Text style={styles.leadPickerStageText}>{lead.stage}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#64748B" />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
      
      {/* Comments Modal */}
      <Modal
        visible={showComments}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowComments(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowComments(false)}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Comments</Text>
            <View style={{ width: 24 }} />
          </View>
          
          {loadingComments ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.commentsList}
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyCommentsText}>No comments yet</Text>
                </View>
              }
              renderItem={({ item: comment }) => (
                <View style={styles.commentItem}>
                  <View style={[styles.commentAvatar, { backgroundColor: getRoleBadgeColor(comment.author_role) }]}>
                    <Text style={styles.commentAvatarText}>
                      {comment.author_name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{comment.author_name}</Text>
                      <Text style={styles.commentTime}>{formatTimeAgo(comment.created_at)}</Text>
                    </View>
                    <Text style={styles.commentText}>{comment.content}</Text>
                  </View>
                </View>
              )}
            />
          )}
          
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.commentInputContainer}
          >
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor="#64748B"
              value={newComment}
              onChangeText={setNewComment}
            />
            <TouchableOpacity 
              style={styles.sendButton}
              onPress={handleAddComment}
              disabled={postingComment || !newComment.trim()}
            >
              {postingComment ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Ionicons name="send" size={20} color={newComment.trim() ? '#3B82F6' : '#64748B'} />
              )}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    padding: 8,
  },
  newPostButton: {
    backgroundColor: '#3B82F6',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  postCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pinnedPost: {
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  pinnedText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  timestamp: {
    fontSize: 12,
    color: '#64748B',
  },
  editedText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postTypeBadge: {
    padding: 4,
  },
  postContent: {
    fontSize: 15,
    color: '#E2E8F0',
    lineHeight: 22,
    marginBottom: 12,
  },
  linkedLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkedLeadText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  leadStageBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  leadStageText: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'capitalize',
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  reactions: {
    flexDirection: 'row',
    gap: 4,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  reactionActive: {
    backgroundColor: '#1E3A5F',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
  },
  commentCount: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    fontSize: 16,
    color: '#94A3B8',
  },
  postButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  postButtonDisabled: {
    color: '#475569',
  },
  typeSelector: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    marginRight: 8,
  },
  typeChipActive: {
    backgroundColor: '#3B82F6',
  },
  typeChipText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  postInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    textAlignVertical: 'top',
  },
  commentsList: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyCommentsText: {
    fontSize: 14,
    color: '#64748B',
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  commentContent: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  commentTime: {
    fontSize: 11,
    color: '#64748B',
  },
  commentText: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  commentInputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFFFFF',
    marginRight: 12,
  },
  sendButton: {
    padding: 8,
  },
  // Lead Linking Styles
  leadLinkSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  linkedLeadPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
  },
  linkedLeadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkedLeadPreviewText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  linkLeadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  linkLeadButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  leadSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  leadSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#FFFFFF',
  },
  leadPickerList: {
    padding: 16,
    paddingBottom: 40,
  },
  leadPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  leadPickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  leadPickerAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  leadPickerInfo: {
    flex: 1,
  },
  leadPickerName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  leadPickerStageBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  leadPickerStageText: {
    color: '#94A3B8',
    fontSize: 11,
    textTransform: 'capitalize',
  },
});
