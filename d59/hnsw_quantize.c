/*-------------------------------------------------------------------------
 *
 * hnsw_quantize.c
 *	  Product Quantization (PQ) for HNSW index compression
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include "utils/memutils.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define HNSW_KMEANS_ITERATIONS		100
#define HNSW_KMEANS_EPSILON		1e-6

/*
 * Create PQ codebook
 */
HnswPQCodebook *
hnsw_pq_create_codebook(int num_subspaces, int num_centroids, int dimensions)
{
	HnswPQCodebook *codebook;
	int				subspace_dim;
	
	subspace_dim = dimensions / num_subspaces;
	if (dimensions % num_subspaces != 0)
		subspace_dim++;
	
	codebook = (HnswPQCodebook *) palloc0(sizeof(HnswPQCodebook));
	codebook->num_subspaces = num_subspaces;
	codebook->num_centroids = num_centroids;
	codebook->subspace_dim = subspace_dim;
	
	/* Allocate centroids: M x K x subspace_dim */
	codebook->centroids = (float *) palloc0(num_subspaces * num_centroids *
											  subspace_dim * sizeof(float));
	
	/* Precomputed norms for each centroid */
	codebook->precomputed_norms = (float *) palloc0(num_subspaces * num_centroids *
													 sizeof(float));
	
	ereport(LOG,
			(errmsg("[HNSW PQ] Created codebook: M=%d, K=%d, dim=%d, subspace_dim=%d",
					num_subspaces, num_centroids, dimensions, subspace_dim)));
	
	return codebook;
}

/*
 * Destroy PQ codebook
 */
void
hnsw_pq_destroy_codebook(HnswPQCodebook *codebook)
{
	if (codebook)
	{
		if (codebook->centroids)
			pfree(codebook->centroids);
		if (codebook->precomputed_norms)
			pfree(codebook->precomputed_norms);
		pfree(codebook);
	}
}

/*
 * Simple k-means clustering for a single subspace
 */
void
hnsw_pq_train_kmeans(float *data, int num_vectors, int dim, int k, float *centroids)
{
	int			i, j, iter, closest;
	float	   *distances;
	int		   *assignments;
	int		   *counts;
	float		dist, diff;
	float		min_dist;
	bool		changed;
	
	distances = (float *) palloc(num_vectors * sizeof(float));
	assignments = (int *) palloc(num_vectors * sizeof(int));
	counts = (int *) palloc(k * sizeof(int));
	
	/* Initialize centroids with random data points */
	for (i = 0; i < k; i++)
	{
		int			idx = rand() % num_vectors;
		memcpy(&centroids[i * dim], &data[idx * dim], dim * sizeof(float));
	}
	
	/* Main k-means loop */
	for (iter = 0; iter < HNSW_KMEANS_ITERATIONS; iter++)
	{
		/* Assignment step */
		changed = false;
		memset(counts, 0, k * sizeof(int));
		
		for (i = 0; i < num_vectors; i++)
		{
			min_dist = FLT_MAX;
			closest = 0;
			
			for (j = 0; j < k; j++)
			{
				dist = 0.0f;
				for (int d = 0; d < dim; d++)
				{
					diff = data[i * dim + d] - centroids[j * dim + d];
					dist += diff * diff;
				}
				
				if (dist < min_dist)
				{
					min_dist = dist;
					closest = j;
				}
			}
			
			if (assignments[i] != closest)
			{
				assignments[i] = closest;
				changed = true;
			}
			counts[closest]++;
			distances[i] = min_dist;
		}
		
		/* Update step */
		memset(centroids, 0, k * dim * sizeof(float));
		
		for (i = 0; i < num_vectors; i++)
		{
			int			c = assignments[i];
			for (int d = 0; d < dim; d++)
				centroids[c * dim + d] += data[i * dim + d];
		}
		
		for (j = 0; j < k; j++)
		{
			if (counts[j] > 0)
			{
				for (int d = 0; d < dim; d++)
					centroids[j * dim + d] /= counts[j];
			}
			else
			{
				/* Reinitialize empty cluster with random point */
				int			idx = rand() % num_vectors;
				memcpy(&centroids[j * dim], &data[idx * dim], dim * sizeof(float));
			}
		}
		
		if (!changed)
			break;
	}
	
	/* Compute centroid norms for fast distance computation */
	for (j = 0; j < k; j++)
	{
		float		norm = 0.0f;
		for (int d = 0; d < dim; d++)
			norm += centroids[j * dim + d] * centroids[j * dim + d];
	}
	
	pfree(distances);
	pfree(assignments);
	pfree(counts);
}

/*
 * Train PQ codebook with sample vectors
 */
void
hnsw_pq_train_codebook(HnswPQCodebook *codebook, HnswVector **samples, int num_samples)
{
	int			m, subspace_dim;
	float	   *subspace_data;
	int			i, d;
	
	m = codebook->num_subspaces;
	subspace_dim = codebook->subspace_dim;
	
	ereport(LOG,
			(errmsg("[HNSW PQ] Training codebook with %d samples, %d subspaces",
					num_samples, m)));
	
	/* Train each subspace independently */
	for (int s = 0; s < m; s++)
	{
		/* Extract subspace data */
		subspace_data = (float *) palloc(num_samples * subspace_dim * sizeof(float));
		
		for (i = 0; i < num_samples; i++)
		{
			for (d = 0; d < subspace_dim; d++)
			{
				int			orig_idx = s * subspace_dim + d;
				if (orig_idx < 2048)	/* Max dimensions check */
					subspace_data[i * subspace_dim + d] = samples[i][orig_idx];
				else
					subspace_data[i * subspace_dim + d] = 0.0f;
			}
		}
		
		/* Run k-means on this subspace */
		float	   *centroid_ptr = &codebook->centroids[s * codebook->num_centroids * subspace_dim];
		hnsw_pq_train_kmeans(subspace_data, num_samples, subspace_dim,
							  codebook->num_centroids, centroid_ptr);
		
		/* Precompute norms for this subspace */
		for (int k = 0; k < codebook->num_centroids; k++)
		{
			float		norm = 0.0f;
			for (d = 0; d < subspace_dim; d++)
			{
				float		val = centroid_ptr[k * subspace_dim + d];
				norm += val * val;
			}
			codebook->precomputed_norms[s * codebook->num_centroids + k] = norm;
		}
		
		pfree(subspace_data);
	}
	
	ereport(LOG,
			(errmsg("[HNSW PQ] Codebook training complete")));
}

/*
 * Encode full precision vector to PQ compressed format
 */
HnswPQVector *
hnsw_pq_encode_vector(HnswPQCodebook *codebook, HnswVector *vector, int dimensions)
{
	HnswPQVector *pq_vec;
	int			m, subspace_dim;
	int			s, d, k, best_k;
	float		dist, min_dist, diff;
	float		residual_norm;
	float	   *reconstructed;
	
	m = codebook->num_subspaces;
	subspace_dim = codebook->subspace_dim;
	
	pq_vec = (HnswPQVector *) palloc0(sizeof(HnswPQVector));
	pq_vec->codes = (uint8 *) palloc(m * sizeof(uint8));
	pq_vec->is_compressed = true;
	pq_vec->full_vector = NULL;
	pq_vec->access_count = 0;
	
	reconstructed = (float *) palloc0(dimensions * sizeof(float));
	
	/* Encode each subspace */
	for (s = 0; s < m; s++)
	{
		min_dist = FLT_MAX;
		best_k = 0;
		
		float	   *centroid_ptr = &codebook->centroids[s * codebook->num_centroids * subspace_dim];
		
		/* Find closest centroid */
		for (k = 0; k < codebook->num_centroids; k++)
		{
			dist = 0.0f;
			for (d = 0; d < subspace_dim; d++)
			{
				int			orig_idx = s * subspace_dim + d;
				if (orig_idx < dimensions)
				{
					diff = vector[orig_idx] - centroid_ptr[k * subspace_dim + d];
					dist += diff * diff;
				}
			}
			
			if (dist < min_dist)
			{
				min_dist = dist;
				best_k = k;
			}
		}
		
		pq_vec->codes[s] = (uint8) best_k;
		
		/* Reconstruct vector for residual computation */
		for (d = 0; d < subspace_dim; d++)
		{
			int			orig_idx = s * subspace_dim + d;
			if (orig_idx < dimensions)
				reconstructed[orig_idx] = centroid_ptr[best_k * subspace_dim + d];
		}
	}
	
	/* Compute residual norm (correction factor) */
	residual_norm = 0.0f;
	for (d = 0; d < dimensions; d++)
	{
		diff = vector[d] - reconstructed[d];
		residual_norm += diff * diff;
	}
	pq_vec->residual_norm = sqrtf(residual_norm);
	
	pfree(reconstructed);
	return pq_vec;
}

/*
 * Decode PQ compressed vector back to full precision (approximate)
 */
HnswVector *
hnsw_pq_decode_vector(HnswPQCodebook *codebook, HnswPQVector *pq_vec, int dimensions)
{
	HnswVector *result;
	int			m, subspace_dim;
	int			s, d, k;
	
	m = codebook->num_subspaces;
	subspace_dim = codebook->subspace_dim;
	
	result = (HnswVector *) palloc0(dimensions * sizeof(HnswVector));
	
	for (s = 0; s < m; s++)
	{
		k = pq_vec->codes[s];
		float	   *centroid_ptr = &codebook->centroids[s * codebook->num_centroids * subspace_dim];
		
		for (d = 0; d < subspace_dim; d++)
		{
			int			orig_idx = s * subspace_dim + d;
			if (orig_idx < dimensions)
				result[orig_idx] = centroid_ptr[k * subspace_dim + d];
		}
	}
	
	return result;
}

/*
 * Free PQ vector
 */
void
hnsw_pq_free_vector(HnswPQVector *pq_vec)
{
	if (pq_vec)
	{
		if (pq_vec->codes)
			pfree(pq_vec->codes);
		if (pq_vec->full_vector)
			pfree(pq_vec->full_vector);
		pfree(pq_vec);
	}
}

/*
 * Create ADC (Asymmetric Distance Computation) lookup table for a query vector
 */
HnswADCTable *
hnsw_adc_create_table(HnswPQCodebook *codebook, HnswVector *query)
{
	HnswADCTable *table;
	int			m, k, subspace_dim;
	int			s, d;
	float		dot, query_norm_sq, centroid_norm;
	
	m = codebook->num_subspaces;
	k = codebook->num_centroids;
	subspace_dim = codebook->subspace_dim;
	
	table = (HnswADCTable *) palloc0(sizeof(HnswADCTable));
	table->num_subspaces = m;
	table->num_centroids = k;
	table->dist_table = (float *) palloc(m * k * sizeof(float));
	
	/* Precompute distance for each subspace and each centroid */
	for (s = 0; s < m; s++)
	{
		for (int cent = 0; cent < k; cent++)
		{
			dot = 0.0f;
			query_norm_sq = 0.0f;
			
			float	   *centroid_ptr = &codebook->centroids[s * k * subspace_dim + cent * subspace_dim];
			
			for (d = 0; d < subspace_dim; d++)
			{
				int			orig_idx = s * subspace_dim + d;
				if (orig_idx < 2048)	/* Max dimensions */
				{
					float		q = query[orig_idx];
					float		c = centroid_ptr[d];
					dot += q * c;
					query_norm_sq += q * q;
				}
			}
			
			centroid_norm = codebook->precomputed_norms[s * k + cent];
			
			/* L2 distance squared: ||x-y||^2 = ||x||^2 + ||y||^2 - 2x·y */
			table->dist_table[s * k + cent] = query_norm_sq + centroid_norm - 2.0f * dot;
		}
	}
	
	return table;
}

/*
 * Destroy ADC table
 */
void
hnsw_adc_destroy_table(HnswADCTable *table)
{
	if (table)
	{
		if (table->dist_table)
			pfree(table->dist_table);
		pfree(table);
	}
}

/*
 * Compute distance using ADC lookup table (single vector)
 */
float
hnsw_adc_compute_distance(HnswADCTable *table, HnswPQVector *pq_vec)
{
	float		total_dist = 0.0f;
	int			s;
	
	for (s = 0; s < table->num_subspaces; s++)
	{
		int			k = pq_vec->codes[s];
		total_dist += table->dist_table[s * table->num_centroids + k];
	}
	
	/* Apply residual correction */
	total_dist += pq_vec->residual_norm * 0.1f;	/* Weighted residual */
	
	return sqrtf(Max(total_dist, 0.0f));
}

/*
 * Compute distances for multiple vectors (multi-sequence optimization)
 */
float
hnsw_adc_compute_distance_multi(HnswADCTable *table, HnswPQVector **pq_vecs,
								 int num_vecs, float *results)
{
	int			i, s;
	float		total_dist;
	
	for (i = 0; i < num_vecs; i++)
	{
		total_dist = 0.0f;
		for (s = 0; s < table->num_subspaces; s++)
		{
			int			k = pq_vecs[i]->codes[s];
			total_dist += table->dist_table[s * table->num_centroids + k];
		}
		results[i] = sqrtf(Max(total_dist + pq_vecs[i]->residual_norm * 0.1f, 0.0f));
	}
	
	return 0.0f;
}

/*
 * Create PQ training state
 */
HnswPQTrainState *
hnsw_pq_train_state_create(int max_samples)
{
	HnswPQTrainState *state;
	
	state = (HnswPQTrainState *) palloc0(sizeof(HnswPQTrainState));
	state->max_samples = max_samples;
	state->training_samples = (HnswVector **) palloc(max_samples * sizeof(HnswVector *));
	state->num_samples = 0;
	state->last_train_version = 0;
	state->current_version = 1;
	state->insert_count_since_train = 0;
	state->delete_count_since_train = 0;
	state->total_data_count = 0;
	
	return state;
}

/*
 * Destroy PQ training state
 */
void
hnsw_pq_train_state_destroy(HnswPQTrainState *state)
{
	int			i;
	
	if (state)
	{
		for (i = 0; i < state->num_samples; i++)
			pfree(state->training_samples[i]);
		pfree(state->training_samples);
		if (state->codebook)
			hnsw_pq_destroy_codebook(state->codebook);
		pfree(state);
	}
}

/*
 * Add training sample
 */
void
hnsw_pq_add_sample(HnswPQTrainState *state, HnswVector *vector, int dimensions)
{
	HnswVector *copy;
	
	if (state->num_samples >= state->max_samples)
		return;
	
	copy = (HnswVector *) palloc(dimensions * sizeof(HnswVector));
	memcpy(copy, vector, dimensions * sizeof(HnswVector));
	
	state->training_samples[state->num_samples++] = copy;
}

/*
 * Check if codebook needs retraining (20% data change threshold)
 */
bool
hnsw_pq_needs_retrain(HnswPQTrainState *state)
{
	uint64		changed_count;
	float		change_ratio;
	
	if (state->total_data_count == 0)
		return false;
	
	changed_count = state->insert_count_since_train + state->delete_count_since_train;
	change_ratio = (float) changed_count / state->total_data_count;
	
	if (change_ratio >= HNSW_PQ_RETRAIN_THRESHOLD)
	{
		ereport(DEBUG1,
				(errmsg("[HNSW PQ] Codebook retrain triggered: change ratio %.2f%% (threshold %.0f%%)",
						change_ratio * 100.0f, HNSW_PQ_RETRAIN_THRESHOLD * 100.0f)));
		return true;
	}
	
	return false;
}

/*
 * Trigger codebook retraining
 */
void
hnsw_pq_trigger_retrain(HnswIndex *index)
{
	HnswPQTrainState *state;
	HASH_SEQ_STATUS status;
	HnswNodeID *nodeid;
	HnswNode   *node;
	int			sample_count = 0;
	
	if (!index->enable_pq || !index->pq_train_state)
		return;
	
	state = index->pq_train_state;
	
	ereport(LOG,
			(errmsg("[HNSW PQ] Starting codebook retraining")));
	
	/* Collect samples from existing nodes */
	hash_seq_init(&status, index->node_cache);
	while ((nodeid = (HnswNodeID *) hash_seq_search(&status)) != NULL &&
		   sample_count < state->max_samples)
	{
		node = (HnswNode *) hash_search(index->node_cache, nodeid, HASH_FIND, NULL);
		if (node && !(node->flags & HNSW_NODE_DELETED))
		{
			if (node->use_pq && node->pq_vector.full_vector)
			{
				hnsw_pq_add_sample(state, node->pq_vector.full_vector, index->dimensions);
				sample_count++;
			}
			else if (!node->use_pq)
			{
				hnsw_pq_add_sample(state, node->vector, index->dimensions);
				sample_count++;
			}
		}
	}
	
	if (sample_count > 10)	/* Need enough samples */
	{
		/* Train new codebook */
		if (state->codebook)
			hnsw_pq_destroy_codebook(state->codebook);
		
		state->codebook = hnsw_pq_create_codebook(index->pq_m, index->pq_k, index->dimensions);
		hnsw_pq_train_codebook(state->codebook, state->training_samples, sample_count);
		
		/* Update index codebook */
		if (index->pq_codebook)
			hnsw_pq_destroy_codebook(index->pq_codebook);
		index->pq_codebook = state->codebook;
		state->codebook = NULL;	/* Ownership transferred */
		
		/* Reset counters */
		state->last_train_version = state->current_version;
		state->insert_count_since_train = 0;
		state->delete_count_since_train = 0;
		
		/* Clear training samples */
		for (int i = 0; i < state->num_samples; i++)
			pfree(state->training_samples[i]);
		state->num_samples = 0;
		
		ereport(LOG,
				(errmsg("[HNSW PQ] Codebook retraining complete with %d samples",
						sample_count)));
	}
	else
	{
		ereport(WARNING,
				(errmsg("[HNSW PQ] Insufficient samples for retraining (%d < 10)",
						sample_count)));
	}
}

/*
 * Check if node should change hot/cold status in hybrid mode
 */
void
hnsw_pq_check_hybrid_status(HnswIndex *index, HnswNode *node)
{
	if (!index->hybrid_mode)
		return;
	
	if (node->use_pq)
	{
		/* Currently cold - check if it should become hot */
		if (node->pq_vector.access_count >= index->hot_threshold)
			hnsw_pq_promote_to_hot(index, node);
	}
}

/*
 * Promote cold (compressed) vector to hot (full precision)
 */
void
hnsw_pq_promote_to_hot(HnswIndex *index, HnswNode *node)
{
	HnswVector *full_vec;
	
	if (!node->use_pq || !index->pq_codebook)
		return;
	
	/* Decode to full precision */
	full_vec = hnsw_pq_decode_vector(index->pq_codebook, &node->pq_vector, index->dimensions);
	
	/* Store full precision vector */
	node->pq_vector.full_vector = full_vec;
	node->pq_vector.is_compressed = false;
	
	ereport(DEBUG1,
			(errmsg("[HNSW PQ] Node %lld promoted to hot (full precision)",
					(long long) node->nodeid)));
}

/*
 * Demote hot (full precision) vector to cold (compressed)
 */
void
hnsw_pq_demote_to_cold(HnswIndex *index, HnswNode *node)
{
	HnswPQVector *new_pq_vec;
	
	if (!index->pq_codebook)
		return;
	
	/* Get full precision vector (either direct or stored in pq) */
	HnswVector *vec = node->use_pq ? node->pq_vector.full_vector : node->vector;
	
	if (!vec)
		return;
	
	/* Re-encode */
	new_pq_vec = hnsw_pq_encode_vector(index->pq_codebook, vec, index->dimensions);
	
	/* Update node */
	if (node->pq_vector.codes)
		pfree(node->pq_vector.codes);
	if (node->pq_vector.full_vector)
		pfree(node->pq_vector.full_vector);
	
	node->pq_vector = *new_pq_vec;
	node->use_pq = true;
	pfree(new_pq_vec);	/* Free wrapper, not content */
	
	ereport(DEBUG1,
			(errmsg("[HNSW PQ] Node %lld demoted to cold (compressed)",
					(long long) node->nodeid)));
}

/*
 * Compute PQ distance with residual correction (full precision query)
 */
float
hnsw_pq_distance_with_residual(HnswPQCodebook *codebook, HnswVector *query, HnswPQVector *pq_vec)
{
	HnswADCTable *table;
	float		dist;
	
	table = hnsw_adc_create_table(codebook, query);
	dist = hnsw_adc_compute_distance(table, pq_vec);
	hnsw_adc_destroy_table(table);
	
	return dist;
}

/*
 * Fast PQ distance computation using precomputed ADC table
 */
float
hnsw_pq_distance_fast(HnswADCTable *table, HnswPQVector *pq_vec)
{
	return hnsw_adc_compute_distance(table, pq_vec);
}