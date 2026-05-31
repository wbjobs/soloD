/*-------------------------------------------------------------------------
 *
 * hnsw_search.c
 *	  Search algorithm for HNSW index with PQ quantization support
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"

/*
 * Helper: Compute distance considering PQ mode
 */
static float
hnsw_compute_node_distance(HnswIndex *index, HnswNode *node, HnswVector *query,
						   HnswADCTable *adc_table)
{
	if (index->enable_pq && node->use_pq)
	{
		/* Increment access count for hot/cold tracking */
		node->pq_vector.access_count++;
		
		/* Check for hot/cold status */
		hnsw_pq_check_hybrid_status(index, node);
		
		if (node->pq_vector.is_compressed)
		{
			/* Use ADC for compressed vectors */
			return hnsw_adc_compute_distance(adc_table, &node->pq_vector);
		}
		else
		{
			/* Hot data - use full precision vector */
			return hnsw_l2_distance_avx2(query, node->pq_vector.full_vector, index->dimensions);
		}
	}
	
	/* Default: full precision */
	return hnsw_l2_distance_avx2(query, node->vector, index->dimensions);
}

/*
 * Search for nearest neighbors in HNSW graph (with PQ support)
 */
HnswNeighbor *
hnsw_search(HnswIndex *index, HnswVector *query, int k, int *num_results)
{
	HnswNeighbor *candidates;
	HnswNeighbor *results;
	HnswADCTable *adc_table = NULL;
	HnswNodeID	current;
	int			ef = Max(k, index->ef_search);
	int			num_candidates = 0;
	int			i, layer;

	candidates = (HnswNeighbor *) palloc(ef * 2 * sizeof(HnswNeighbor));
	results = (HnswNeighbor *) palloc(k * sizeof(HnswNeighbor));

	/* Lock for thread safety */
	pthread_mutex_lock(&index->mutex);

	if (index->entry_point == HNSW_INVALID_NODE_ID)
	{
		*num_results = 0;
		pthread_mutex_unlock(&index->mutex);
		pfree(candidates);
		return results;
	}

	/* Precompute ADC table if PQ is enabled */
	if (index->enable_pq && index->pq_codebook)
	{
		adc_table = hnsw_adc_create_table(index->pq_codebook, query);
		ereport(DEBUG2,
				(errmsg("[HNSW PQ] Search using ADC for compressed vectors")));
	}

	/* Start from entry point */
	current = index->entry_point;

	/* Greedy search from highest layer down to layer 1 */
	for (layer = index->num_layers - 1; layer > 0; layer--)
	{
		bool		changed = true;
		float		best_dist;
		HnswNode   *node;
		bool		found;

		node = (HnswNode *) hash_search(index->node_cache,
										&current,
										HASH_FIND,
										&found);

		if (!found)
			break;

		best_dist = hnsw_compute_node_distance(index, node, query, adc_table);

		while (changed)
		{
			changed = false;

			for (i = 0; i < node->num_neighbors; i++)
			{
				HnswNodeID neighbor_id;
				HnswNode   *neighbor;
				float		dist;

				/* Get neighbor ID from neighbor list */
				HnswNeighbor *nb_list = (HnswNeighbor *) 
					(node->use_pq ? 
					 (node->pq_vector.full_vector ? 
						  node->pq_vector.full_vector + index->dimensions : 
						  node->vector + index->dimensions) :
					 node->vector + index->dimensions);
				neighbor_id = nb_list[i].nodeid;

				neighbor = (HnswNode *) hash_search(index->node_cache,
													&neighbor_id,
													HASH_FIND,
													&found);

				if (!found)
					continue;

				if (neighbor->layer < layer)
					continue;

				dist = hnsw_compute_node_distance(index, neighbor, query, adc_table);

				if (dist < best_dist)
				{
					best_dist = dist;
					current = neighbor_id;
					node = neighbor;
					changed = true;
				}
			}
		}
	}

	/* Now do exhaustive search on layer 0 */
	{
		HnswNode   *node;
		bool		found;
		float		dist;

		node = (HnswNode *) hash_search(index->node_cache,
										&current,
										HASH_FIND,
										&found);

		if (!found)
		{
			*num_results = 0;
			if (adc_table)
				hnsw_adc_destroy_table(adc_table);
			pthread_mutex_unlock(&index->mutex);
			pfree(candidates);
			return results;
		}

		dist = hnsw_compute_node_distance(index, node, query, adc_table);

		candidates[0].nodeid = current;
		candidates[0].distance = dist;
		num_candidates = 1;

		/* Keep searching candidates */
		for (i = 0; i < num_candidates && i < ef; i++)
		{
			HnswNodeID current_id = candidates[i].nodeid;
			HnswNode   *current_node;

			current_node = (HnswNode *) hash_search(index->node_cache,
												   &current_id,
												   HASH_FIND,
												   &found);

			if (!found)
				continue;

			/* Check all neighbors on layer 0 */
			for (int j = 0; j < current_node->num_neighbors; j++)
			{
				HnswNeighbor *nb_list = (HnswNeighbor *)
					(current_node->use_pq ?
					 (current_node->pq_vector.full_vector ?
						  current_node->pq_vector.full_vector + index->dimensions :
						  current_node->vector + index->dimensions) :
					 current_node->vector + index->dimensions);
				HnswNodeID	neighbor_id = nb_list[j].nodeid;
				HnswNode   *neighbor;
				float		ndist;
				bool		exists = false;

				/* Check if neighbor already in candidates */
				for (int k = 0; k < num_candidates; k++)
				{
					if (candidates[k].nodeid == neighbor_id)
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

				if (!found)
					continue;

				ndist = hnsw_compute_node_distance(index, neighbor, query, adc_table);

				candidates[num_candidates].nodeid = neighbor_id;
				candidates[num_candidates].distance = ndist;
				num_candidates++;

				/* Sort candidates by distance */
				hnsw_sort_neighbors(candidates, num_candidates);
			}
		}
	}

	/* Cleanup ADC table */
	if (adc_table)
		hnsw_adc_destroy_table(adc_table);

	/* Select top k results */
	*num_results = Min(k, num_candidates);
	for (i = 0; i < *num_results; i++)
		results[i] = candidates[i];

	pthread_mutex_unlock(&index->mutex);
	pfree(candidates);

	return results;
}
