/*-------------------------------------------------------------------------
 *
 * hnsw_vacuum.c
 *	  Vacuum operations for HNSW index
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"

/*
 * Vacuum deleted nodes from HNSW index
 */
void
hnsw_vacuum(HnswIndex *index, IndexVacuumInfo *info)
{
	HASH_SEQ_STATUS status;
	HnswNodeID *node_id;
	HnswNode   *node;
	bool		found;
	int			layer;

	pthread_mutex_lock(&index->mutex);

	/* Iterate through deleted nodes */
	hash_seq_init(&status, index->deleted_nodes);

	while ((node_id = (HnswNodeID *) hash_seq_search(&status)) != NULL)
	{
		node = (HnswNode *) hash_search(index->node_cache,
										node_id,
										HASH_FIND,
										&found);

		if (!found)
			continue;

		/* Remove node from all layers */
		for (layer = 0; layer <= node->layer; layer++)
		{
			HnswLayer *l = &index->layers[layer];
			int			i;

			for (i = 0; i < l->num_nodes; i++)
			{
				if (l->nodes[i] == *node_id)
				{
					/* Shift remaining nodes left */
					if (i < l->num_nodes - 1)
						memmove(&l->nodes[i], &l->nodes[i + 1],
								(l->num_nodes - i - 1) * sizeof(HnswNodeID));
					l->num_nodes--;
					break;
				}
			}
		}

		/* Remove references from neighbors */
		for (layer = 0; layer < index->num_layers; layer++)
		{
			HnswLayer *l = &index->layers[layer];
			int			i;

			for (i = 0; i < l->num_nodes; i++)
			{
				HnswNodeID neighbor_id = l->nodes[i];
				HnswNode   *neighbor;

				neighbor = (HnswNode *) hash_search(index->node_cache,
													&neighbor_id,
													HASH_FIND,
													&found);

				if (!found)
					continue;

				HnswNeighbor *nb_list = (HnswNeighbor *) (neighbor->vector + index->dimensions);
				int			j,
							k;

				for (j = 0, k = 0; j < neighbor->num_neighbors; j++)
				{
					if (nb_list[j].nodeid != *node_id)
					{
						if (k != j)
							nb_list[k] = nb_list[j];
						k++;
					}
				}
				neighbor->num_neighbors = k;
			}
		}

		/* Remove from node cache */
		hash_search(index->node_cache, node_id, HASH_REMOVE, &found);

		/* Remove from deleted nodes */
		hash_search(index->deleted_nodes, node_id, HASH_REMOVE, &found);
	}

	pthread_mutex_unlock(&index->mutex);
}
