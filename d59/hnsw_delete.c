/*-------------------------------------------------------------------------
 *
 * hnsw_delete.c
 *	  Delete and vacuum operations for HNSW index
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"

/*
 * Mark a node as deleted (soft delete)
 */
void
hnsw_delete_node(HnswIndex *index, HnswNodeID nodeid)
{
	HnswNode   *node;
	bool		found;

	pthread_mutex_lock(&index->mutex);

	node = (HnswNode *) hash_search(index->node_cache,
									&nodeid,
									HASH_FIND,
									&found);

	if (found)
	{
		node->flags |= HNSW_NODE_DELETED;

		/* Add to deleted nodes list for later cleanup */
		hash_search(index->deleted_nodes, &nodeid, HASH_ENTER, &found);
	}

	pthread_mutex_unlock(&index->mutex);
}
