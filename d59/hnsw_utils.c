/*-------------------------------------------------------------------------
 *
 * hnsw_utils.c
 *	  Utility functions for HNSW index
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/array.h"
#include "utils/builtins.h"
#include "utils/memutils.h"
#include <stdlib.h>

/*
 * Convert PostgreSQL array to HNSW vector
 */
HnswVector *
array_to_hnsw_vector(ArrayType *array, int *dimensions)
{
	HnswVector *result;
	float4	   *data;
	int			i;

	*dimensions = ARR_DIMS(array)[0];
	data = (float4 *) ARR_DATA_PTR(array);

	result = (HnswVector *) palloc(*dimensions * sizeof(HnswVector));

	for (i = 0; i < *dimensions; i++)
		result[i] = data[i];

	return result;
}

/*
 * Convert HNSW vector to PostgreSQL array
 */
ArrayType *
hnsw_vector_to_array(HnswVector *vector, int dimensions)
{
	Datum	   *datums;
	int			i;

	datums = (Datum *) palloc(dimensions * sizeof(Datum));

	for (i = 0; i < dimensions; i++)
		datums[i] = Float4GetDatum(vector[i]);

	return construct_array(datums, dimensions, FLOAT4OID,
						   sizeof(float4), true, 'i');
}

/*
 * Generate random level for new node
 * Probability decreases exponentially with level
 */
int
hnsw_random_level(HnswIndex *index)
{
	int			level = 0;

	while ((float) rand() / RAND_MAX < index->level_multiplier &&
		   level < index->max_layers - 1)
		level++;

	return level;
}

/*
 * Select M nearest neighbors from candidates
 */
void
hnsw_select_neighbors(HnswIndex *index, HnswNeighbor *candidates,
					  int num_candidates, int m,
					  HnswNeighbor *result, int *num_result)
{
	int			i,
				j;

	/* Simple selection - pick first M sorted */
	*num_result = Min(num_candidates, m);

	for (i = 0; i < *num_result; i++)
		result[i] = candidates[i];
}

/*
 * Compare neighbors for sorting
 */
static int
compare_neighbors(const void *a, const void *b)
{
	HnswNeighbor *na = (HnswNeighbor *) a;
	HnswNeighbor *nb = (HnswNeighbor *) b;

	if (na->distance < nb->distance)
		return -1;
	else if (na->distance > nb->distance)
		return 1;
	else
		return 0;
}

/*
 * Sort neighbors by distance
 */
void
hnsw_sort_neighbors(HnswNeighbor *neighbors, int num)
{
	qsort(neighbors, num, sizeof(HnswNeighbor), compare_neighbors);
}

/*
 * Initialize HNSW index structure
 */
void
hnsw_init_index(HnswIndex *index, Relation rel)
{
	int			i;

	MemSet(index, 0, sizeof(HnswIndex));
	index->index = rel;
	index->max_layers = HNSW_MAX_LAYERS;
	index->m = HNSW_DEFAULT_M;
	index->ef_construction = HNSW_DEFAULT_EF_CONSTRUCTION;
	index->ef_search = HNSW_DEFAULT_EF_SEARCH;
	index->dimensions = HNSW_DEFAULT_DIM;
	index->metric = HNSW_METRIC_L2;
	index->entry_point = HNSW_INVALID_NODE_ID;
	index->level_multiplier = 1.0f / logf((float) HNSW_DEFAULT_M);

	/* Initialize mutex for thread safety */
	pthread_mutex_init(&index->mutex, NULL);

	/* Initialize layers */
	for (i = 0; i < HNSW_MAX_LAYERS; i++)
	{
		index->layers[i].layer_num = i;
		index->layers[i].num_nodes = 0;
		index->layers[i].max_nodes = 1024;
		index->layers[i].nodes = (HnswNodeID *)
			palloc(1024 * sizeof(HnswNodeID));
	}

	/* Initialize node cache */
	HASHCTL		hash_ctl;

	MemSet(&hash_ctl, 0, sizeof(hash_ctl));
	hash_ctl.keysize = sizeof(HnswNodeID);
	hash_ctl.entrysize = sizeof(HnswNode) +
		(HNSW_MAX_DIM + 2 * HNSW_DEFAULT_M) * sizeof(float);

	index->node_cache = hash_create("HNSW node cache",
									1024,
									&hash_ctl,
									HASH_ELEM | HASH_BLOBS);

	/* Initialize deleted nodes table */
	index->deleted_nodes = hash_create("HNSW deleted nodes",
									   256,
									   &hash_ctl,
									   HASH_ELEM | HASH_BLOBS);
}

/*
 * Free HNSW index structure
 */
void
hnsw_free_index(HnswIndex *index)
{
	int			i;

	/* Free layers */
	for (i = 0; i < HNSW_MAX_LAYERS; i++)
		pfree(index->layers[i].nodes);

	/* Destroy hash tables */
	if (index->node_cache)
		hash_destroy(index->node_cache);
	if (index->deleted_nodes)
		hash_destroy(index->deleted_nodes);

	/* Destroy mutex */
	pthread_mutex_destroy(&index->mutex);
}
