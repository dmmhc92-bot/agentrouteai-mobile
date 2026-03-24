import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';

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
  
  // Comments Modal
  const [showComments, setShowComments] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  
  // Auto-refresh interval
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    fetchPosts();
    fetchTeamMembers();
    
    // Auto-refresh every 30 seconds
    refreshIntervalRef.current = setInterval(() => {
      fetchPosts(true);
    }, 30000);
    
    return () => {
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

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Please enter some content');
      return;
    }
    
    setPosting(true);
    try {
      const response = await api.post('/feed', {
        content: newPostContent.trim(),
        post_type: newPostType,
      });
      
      // Add new post to the top
      setPosts(prev => [response.data, ...prev]);
      setNewPostContent('');
      setNewPostType('update');
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
        <Text style={styles.headerTitle}>Team Feed</Text>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
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
});
