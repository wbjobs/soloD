/*-------------------------------------------------------------------------
 *
 * hnsw_insert.c
 *	  Insert algorithm for HNSW index with PQ quantization support
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"

static HnswNodeID next_node_id = 0;

/*
 * Insert a node into HNSW graph (with PQ support)
 */
HnswNodeID
hnsw_insert_node(HnswIndex *index, HnswVector *vector, ItemPointer tid)
{
	HnswNodeID	node_id;
	int			new_level;
	HnswNode   *new_node;
	int			layer, i;
	bool		found;
	HnswNeighbor *entry_points;
	int			num_entries;
	HnswPQVector *pq_vec = NULL;

	pthread_mutex_lock(&index->mutex);

	node_id = next_node_id++;

	/* Generate random level for new node */
	new_level = hnsw_random_level(index);

	/* Allocate and initialize new node */
	size_t		node_size = sizeof(HnswNode) +
		index->dimensions * sizeof(HnswVector) +
		index->m * 2 * sizeof(HnswNeighbor);

	new_node = (HnswNode *) palloc(node_size);
	MemSet(new_node, 0, node_size);

	new_node->nodeid = node_id;
	new_node->layer = new_level;
	new_node->flags = 0;
	new_node->dimensions = index->dimensions;
	new_node->num_neighbors = 0;
	new_node->use_pq = index->enable_pq;

	/* Handle PQ compression if enabled */
	if (index->enable_pq && index->pq_codebook)
	{
		/* Encode vector using PQ */
		pq_vec = hnsw_pq_encode_vector(index->pq_codebook, vector, index->dimensions);
		new_node->pq_vector = *pq_vec;
		pfree(pq_vec);
		
		/* In hybrid mode, store full vector temporarily */
		if (index->hybrid_mode)
		{
			new_node->pq_vector.full_vector = (HnswVector *)
				palloc(index->dimensions * sizeof(HnswVector));
			memcpy(new_node->pq_vector.full_vector, vector, 
				   index->dimensions * sizeof(HnswVector));
		}
	}

	/* Always store full precision vector as fallback */
	memcpy(new_node->vector, vector, index->dimensions * sizeof(HnswVector));

	/* Add to node cache */
	hash_search(index->node_cache, &node_id, HASH_ENTER, &found);

	/* Update training state counters */
	if (index->pq_train_state)
	{
		index->pq_train_state->insert_count_since_train++;
		index->pq_train_state->total_data_count++;
		index->pq_train_state->current_version++;
	}

	/* If this is the first node */
	if (index->entry_point == HNSW_INVALID_NODE_ID)
	{
		index->entry_point = node_id;
		index->num_layers = Max(index->num_layers, new_level + 1);
		index->layers[0].nodes[0] = node_id;
		index->layers[0].num_nodes = 1;

		pthread_mutex_unlock(&index->mutex);
		return node_id;
	}

	/* Update max layers if needed */
	if (new_level + 1 > index->num_layers)
		index->num_layers = new_level + 1;

	/* Find entry point */
	HnswNodeID	current = index->entry_point;
	HnswNode   *curr_node;
	float		best_dist;

	curr_node = (HnswNode *) hash_search(index->node_cache,
										 &current,
										 HASH_FIND,
										 &found);

	if (found)
	{
		if (index->enable_pq && index->pq_codebook)
		{
			/* Use PQ distance for codebook */
			HnswADCTable *adc = hnsw_adc_create_table(index->pq_codebook, vector);
			if (curr_node->use_pq)
				best_dist = hnsw_adc_compute_distance(adc, &curr_node->pq_vector);
			else
				best_dist = hnsw_l2_distance_avx2(vector, curr_node->vector, index->dimensions);
			hnsw_adc_destroy_table(adc);
		}
		else
		{
			best_dist = hnsw_l2_distance_avx2(vector, curr_node->vector, index->dimensions);
		}
	}
	else
	{
		pthread_mutex_unlock(&index->mutex);
		return node_id;
	}

	/* Greedy search from highest layer down to new_level + 1 */
	for (layer = index->num_layers - 1; layer > new_level; layer--)
	{
		bool		changed = true;

		while (changed)
		{
			changed = false;

			for (i = 0; i < curr_node->num_neighbors; i++)
			{
				HnswNeighbor *nb_list;
				HnswNodeID	neighbor_id;
				HnswNode   *neighbor;
				float		dist;

				/* Get neighbor list considering PQ mode */
				if (curr_node->use_pq && curr_node->pq_vector.full_vector)
					nb_list = (HnswNeighbor *) (curr_node->pq_vector.full_vector + index->dimensions);
				else
					nb_list = (HnswNeighbor *) (curr_node->vector + index->dimensions);
				
				neighbor_id = nb_list[i].nodeid;

				neighbor = (HnswNode *) hash_search(index->node_cache,
													&neighbor_id,
													HASH_FIND,
													&found);

				if (!found || neighbor->layer < layer)
					continue;

				/* Compute distance considering PQ mode */
				if (index->enable_pq && index->pq_codebook)
				{
					HnswADCTable *adc = hnsw_adc_create_table(index->pq_codebook, vector);
					if (neighbor->use_pq)
						dist = hnsw_adc_compute_distance(adc, &neighbor->pq_vector);
					else
						dist = hnsw_l2_distance_avx2(vector, neighbor->vector, index->dimensions);
					hnsw_adc_destroy_table(adc);
				}
				else
				{
					dist = hnsw_l2_distance_avx2(vector, neighbor->vector, index->dimensions);
				}

				if (dist < best_dist)
				{
					best_dist = dist;
					current = neighbor_id;
					curr_node = neighbor;
					changed = true;
				}
			}
		}
	}

	/* Now insert from new_level down to 0 */
	entry_points = (HnswNeighbor *) palloc(index->ef_construction * sizeof(HnswNeighbor));
	entry_points[0].nodeid = current;
	entry_points[0].distance = best_dist;
	num_entries = 1;

	for (layer = new_level; layer >= 0; layer--)
	{
		/* Expand entry points in this layer */
		for (i = 0; i < num_entries && i < index->ef_construction; i++)
		{
			HnswNodeID ep_id = entry_points[i].nodeid;
			HnswNode   *ep_node;

			ep_node = (HnswNode *) hash_search(index->node_cache,
											   &ep_id,
											   HASH_FIND,
											   &found);

			if (!found)
				continue;

			for (int j = 0; j < ep_node->num_neighbors; j++)
			{
				HnswNeighbor *nb_list;
				HnswNodeID	neighbor_id;
				HnswNode   *neighbor;
				float		ndist;
				bool		exists = false;

				/* Get neighbor list considering PQ mode */
				if (ep_node->use_pq && ep_node->pq_vector.full_vector)
					nb_list = (HnswNeighbor *) (ep_node->pq_vector.full_vector + index->dimensions);
				else
					nb_list = (HnswNeighbor *) (ep_node->vector + index->dimensions);
				
				neighbor_id = nb_list[j].nodeid;

				for (int k = 0; k < num_entries; k++)
				{
					if (entry_points[k].nodeid == neighbor_id)
					{
						exists = true;
						break;
					}
				}

				if (exists)
					continue;

				neighbor = (HnswNode *) hash_search(index->node_cache,
													&neighbor_id,
													HASH_FIND,
													&found);

				if (!found || neighbor->layer < layer)
					continue;

				/* Compute distance considering PQ mode */
				if (index->enable_pq && index->pq_codebook)
				{
					HnswADCTable *adc = hnsw_adc_create_table(index->pq_codebook, vector);
					if (neighbor->use_pq)
						ndist = hnsw_adc_compute_distance(adc, &neighbor->pq_vector);
					else
						ndist = hnsw_l2_distance_avx2(vector, neighbor->vector, index->dimensions);
					hnsw_adc_destroy_table(adc);
				}
				else
				{
					ndist = hnsw_l2_distance_avx2(vector, neighbor->vector, index->dimensions);
				}

				entry_points[num_entries].nodeid = neighbor_id;
				entry_points[num_entries].distance = ndist;
				num_entries++;

				hnsw_sort_neighbors(entry_points, num_entries);
			}
		}

		/* Select M neighbors */
		HnswNeighbor neighbors[HNSW_DEFAULT_M];
		int			num_neighbors;

		hnsw_select_neighbors(index, entry_points, num_entries,
							  index->m, neighbors, &num_neighbors);

		/* Add bidirectional connections */
		HnswNeighbor *new_nb_list;
		if (new_node->use_pq && new_node->pq_vector.full_vector)
			new_nb_list = (HnswNeighbor *) (new_node->pq_vector.full_vector + index->dimensions);
		else
			new_nb_list = (HnswNeighbor *) (new_node->vector + index->dimensions);

		for (i = 0; i < num_neighbors; i++)
		{
			HnswNodeID neighbor_id = neighbors[i].nodeid;
			HnswNode   *neighbor;

			neighbor = (HnswNode *) hash_search(index->node_cache,
												&neighbor_id,
												HASH_FIND,
												&found);

			if (!found)
				continue;

			/* Add neighbor to new node */
			new_nb_list[new_node->num_neighbors].nodeid = neighbor_id;
			new_nb_list[new_node->num_neighbors].distance = neighbors[i].distance;
			new_node->num_neighbors++;

			/* Add new node to neighbor's list */
			HnswNeighbor *nb_list;
			if (neighbor->use_pq && neighbor->pq_vector.full_vector)
				nb_list = (HnswNeighbor *) (neighbor->pq_vector.full_vector + index->dimensions);
			else
				nb_list = (HnswNeighbor *) (neighbor->vector + index->dimensions);

			if (neighbor->num_neighbors < index->m * 2)
			{
				nb_list[neighbor->num_neighbors].nodeid = node_id;
				nb_list[neighbor->num_neighbors].distance = neighbors[i].distance;
				neighbor->num_neighbors++;
			}
		}

		/* Add node to layer */
		if (index->layers[layer].num_nodes >= index->layers[layer].max_nodes)
		{
			index->layers[layer].max_nodes *= 2;
			index->layers[layer].nodes = (HnswNodeID *)
				repalloc(index->layers[layer].nodes,
						index->layers[layer].max_nodes * sizeof(HnswNodeID));
		}
		index->layers[layer].nodes[index->layers[layer].num_nodes++] = node_id;
	}

	pfree(entry_points);

	/* Update entry point if new node is at higher level */
	if (new_level > curr_node->layer)
		index->entry_point = node_id;

	/* Check for PQ retraining after insertion */
	if (index->pq_train_state && hnsw_pq_needs_retrain(index->pq_train_state))
	{
		ereport(DEBUG1,
				(errmsg("[HNSW PQ] Triggering codebook retrain after insert")));
		hnsw_pq_trigger_retrain(index);
	}

	pthread_mutex_unlock(&index->mutex);

	return node_id;
}
