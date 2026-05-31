/*-------------------------------------------------------------------------
 *
 * hnsw.h
 *	  Header for HNSW index
 *
 *-------------------------------------------------------------------------
 */

#ifndef HNSW_H
#define HNSW_H

#include "postgres.h"
#include "access/amapi.h"
#include "access/itup.h"
#include "access/generic_xlog.h"
#include "storage/bufmgr.h"
#include "utils/array.h"
#include "utils/hsearch.h"
#include "utils/tuplesort.h"
#include "pthread.h"

/* Configuration parameters */
#define HNSW_MAX_DIM				2048
#define HNSW_DEFAULT_M				16
#define HNSW_DEFAULT_EF_CONSTRUCTION	64
#define HNSW_DEFAULT_EF_SEARCH		32
#define HNSW_MAX_LAYERS				32
#define HNSW_DEFAULT_DIM			128

/* Distance metrics */
#define HNSW_METRIC_L2				0
#define HNSW_METRIC_COSINE			1

/* Node flags */
#define HNSW_NODE_DELETED			0x01
#define HNSW_NODE_MARKED			0x02

/* Vector type */
typedef float4 HnswVector;

/* HNSW Node ID (internal) */
typedef uint64 HnswNodeID;
#define HNSW_INVALID_NODE_ID		((HnswNodeID)-1)

/* Product Quantization (PQ) configuration */
#define HNSW_PQ_DEFAULT_M			16			/* Default number of subspaces */
#define HNSW_PQ_DEFAULT_K			256			/* Number of centroids per subspace (2^8) */
#define HNSW_PQ_CODE_SIZE			1			/* 1 byte per subspace code */
#define HNSW_PQ_RETRAIN_THRESHOLD	0.20		/* 20% data change triggers retrain */
#define HNSW_PQ_HOT_THRESHOLD		1000		/* Access count threshold for hot data */

/* PQ Codebook - one per subspace */
typedef struct HnswPQCodebook
{
	int				num_subspaces;		/* M */
	int				num_centroids;		/* K */
	int				subspace_dim;		/* Dimensions per subspace */
	float		   *centroids;			/* M x K x subspace_dim centroids */
	float		   *precomputed_norms;	/* Precomputed norms for fast ADC */
} HnswPQCodebook;

/* Compressed vector using PQ */
typedef struct HnswPQVector
{
	uint8		   *codes;				/* M bytes (1 per subspace) */
	float			residual_norm;		/* Residual norm for correction */
	bool			is_compressed;		/* Flag: true=compressed, false=full precision */
	HnswVector	   *full_vector;		/* Full precision vector (if hot) */
	uint32			access_count;		/* Access count for hot/cold classification */
} HnswPQVector;

/* PQ Training state */
typedef struct HnswPQTrainState
{
	HnswPQCodebook *codebook;
	HnswVector	  **training_samples;
	int				num_samples;
	int				max_samples;
	uint64			last_train_version;
	uint64			current_version;
	uint64			insert_count_since_train;
	uint64			delete_count_since_train;
	uint64			total_data_count;
} HnswPQTrainState;

/* ADC (Asymmetric Distance Computation) lookup table */
typedef struct HnswADCTable
{
	float		   *dist_table;			/* M x K precomputed distances */
	int				num_subspaces;
	int				num_centroids;
} HnswADCTable;

/* Neighbor list entry */
typedef struct HnswNeighbor
{
	HnswNodeID		nodeid;
	float			distance;
} HnswNeighbor;

/* HNSW Node - stored in index (with PQ support) */
typedef struct HnswNode
{
	HnswNodeID		nodeid;
	uint16			layer;
	uint16			flags;
	uint16			dimensions;
	uint16			num_neighbors;
	bool			use_pq;			/* Use product quantization */
	HnswPQVector	pq_vector;			/* PQ compressed vector */
	HnswVector		vector[FLEXIBLE_ARRAY_MEMBER];	/* Full precision fallback */
	/* Neighbors follow: HnswNeighbor neighbors[] */
} HnswNode;

/* HNSW Graph - per layer */
typedef struct HnswLayer
{
	uint16			layer_num;
	uint32			num_nodes;
	uint32			max_nodes;
	HnswNodeID		*nodes;			/* array of node IDs */
} HnswLayer;

/* HNSW Index - in-memory structure (with PQ support) */
typedef struct HnswIndex
{
	Relation		index;
	Buffer			metabuf;
	uint16			num_layers;
	uint16			max_layers;
	uint16			m;				/* max number of neighbors */
	uint16			ef_construction;
	uint16			ef_search;
	uint16			dimensions;
	uint8			metric;			/* L2 or cosine */
	HnswNodeID		entry_point;
	float			level_multiplier;
	HTAB		   *node_cache;		/* cache for nodes */
	HTAB		   *deleted_nodes;	/* deleted nodes for vacuum */
	pthread_mutex_t	mutex;			/* for thread safety */
	HnswLayer		layers[HNSW_MAX_LAYERS];
	
	/* Product Quantization (PQ) fields */
	bool			enable_pq;		/* Enable PQ compression */
	int				pq_m;			/* Number of subspaces (M) */
	int				pq_k;			/* Number of centroids per subspace (K) */
	HnswPQCodebook *pq_codebook;	/* PQ codebook */
	HnswPQTrainState *pq_train_state;	/* PQ training state */
	bool			hybrid_mode;	/* Hybrid: hot=full, cold=compressed */
	uint32			hot_threshold;	/* Access count for hot data */
} HnswIndex;

/* HNSW Scan State */
typedef struct HnswScanState
{
	HnswIndex	   *index;
	HnswVector	   *query_vector;
	uint32			ef;
	uint32			limit;
	uint32			processed;
	HnswNeighbor   *results;
	uint32			num_results;
} HnswScanState;

/* Slab allocator - fixed size memory pool */
#define HNSW_SLAB_SIZE			(64 * 1024 * 1024)	/* 64MB per slab */
#define HNSW_NODE_SLAB_CHUNK	1024				/* Preallocate 1024 nodes per slab */
#define HNSW_VECTOR_SLAB_CHUNK	256					/* Preallocate 256 vectors per slab */

typedef struct HnswSlabBlock
{
	struct HnswSlabBlock *next;
	size_t			used;
	size_t			size;
	char			data[FLEXIBLE_ARRAY_MEMBER];
} HnswSlabBlock;

typedef struct HnswSlab
{
	MemoryContext	memcxt;
	HnswSlabBlock  *head;
	HnswSlabBlock  *current;
	size_t			total_allocated;
	size_t			max_allocation;	/* work_mem limit */
	size_t			object_size;
	int				num_blocks;
} HnswSlab;

/* HNSW Build State - for parallel build with batch support */
#define HNSW_BATCH_SIZE			10000	/* Insert 10000 vectors per batch */
#define HNSW_MEMORY_CHECK_INTERVAL	1000	/* Check memory every 1000 inserts */

typedef struct HnswBuildState
{
	HnswIndex	   *index;
	Tuplesortstate *tuplesort;
	double			indtuples;
	int				num_workers;
	bool			parallel;
	pthread_t	   *workers;
	pthread_mutex_t	build_mutex;
	pthread_cond_t	build_cond;
	void		   *work_queue;
	
	/* Batch build support */
	HnswSlab	   *node_slab;		/* Slab for nodes */
	HnswSlab	   *vector_slab;	/* Slab for vectors */
	int				batch_count;	/* Current batch count */
	int				total_count;	/* Total inserted count */
	size_t			work_mem_limit;	/* work_mem in bytes */
	
	/* Batch buffer */
	HnswVector	  **batch_vectors;
	ItemPointer	   *batch_tids;
	int				batch_fill;
} HnswBuildState;

/* Vector conversion utilities */
HnswVector *array_to_hnsw_vector(ArrayType *array, int *dimensions);
ArrayType *hnsw_vector_to_array(HnswVector *vector, int dimensions);

/* Distance functions */
float hnsw_l2_distance(HnswVector *a, HnswVector *b, int dimensions);
float hnsw_cosine_distance(HnswVector *a, HnswVector *b, int dimensions);

/* SIMD distance functions */
float hnsw_l2_distance_avx2(HnswVector *a, HnswVector *b, int dimensions);
float hnsw_l2_distance_avx512(HnswVector *a, HnswVector *b, int dimensions);
float hnsw_cosine_distance_avx2(HnswVector *a, HnswVector *b, int dimensions);
float hnsw_cosine_distance_avx512(HnswVector *a, HnswVector *b, int dimensions);

/* HNSW core algorithms */
void hnsw_init_index(HnswIndex *index, Relation rel);
void hnsw_free_index(HnswIndex *index);
HnswNodeID hnsw_insert_node(HnswIndex *index, HnswVector *vector, ItemPointer tid);
void hnsw_delete_node(HnswIndex *index, HnswNodeID nodeid);
HnswNeighbor *hnsw_search(HnswIndex *index, HnswVector *query, int k, int *num_results);

/* Index access method interface */
extern IndexAmRoutine *hnswhandler(PG_FUNCTION_ARGS);

/* Vacuum */
void hnsw_vacuum(HnswIndex *index, IndexVacuumInfo *info);

/* Build */
IndexBuildResult *hnsw_build(Relation heap, Relation index, IndexInfo *indexInfo);
void hnsw_parallel_build(HnswBuildState *state);

/* Utilities */
int hnsw_random_level(HnswIndex *index);
void hnsw_select_neighbors(HnswIndex *index, HnswNeighbor *candidates, int num_candidates,
						   int m, HnswNeighbor *result, int *num_result);

/* Slab allocator functions */
HnswSlab *hnsw_slab_create(MemoryContext parent, size_t object_size, size_t max_allocation);
void *hnsw_slab_alloc(HnswSlab *slab);
void hnsw_slab_reset(HnswSlab *slab);
void hnsw_slab_destroy(HnswSlab *slab);
size_t hnsw_slab_total_allocated(HnswSlab *slab);
bool hnsw_slab_near_limit(HnswSlab *slab);

/* Batch insert functions */
void hnsw_build_batch_init(HnswBuildState *state, HnswIndex *index, size_t work_mem_bytes);
bool hnsw_build_batch_add(HnswBuildState *state, HnswVector *vector, ItemPointer tid);
void hnsw_build_batch_flush(HnswBuildState *state);
void hnsw_build_batch_finish(HnswBuildState *state);
void hnsw_trigger_temp_merge(HnswIndex *index);
void hnsw_log_memory_usage(const char *context, HnswBuildState *state);

/* Product Quantization (PQ) functions */
HnswPQCodebook *hnsw_pq_create_codebook(int num_subspaces, int num_centroids, int dimensions);
void hnsw_pq_destroy_codebook(HnswPQCodebook *codebook);
void hnsw_pq_train_codebook(HnswPQCodebook *codebook, HnswVector **samples, int num_samples);
void hnsw_pq_train_kmeans(float *data, int num_vectors, int dim, int k, float *centroids);

/* Vector encoding/decoding */
HnswPQVector *hnsw_pq_encode_vector(HnswPQCodebook *codebook, HnswVector *vector, int dimensions);
HnswVector *hnsw_pq_decode_vector(HnswPQCodebook *codebook, HnswPQVector *pq_vec, int dimensions);
void hnsw_pq_free_vector(HnswPQVector *pq_vec);

/* ADC (Asymmetric Distance Computation) */
HnswADCTable *hnsw_adc_create_table(HnswPQCodebook *codebook, HnswVector *query);
void hnsw_adc_destroy_table(HnswADCTable *table);
float hnsw_adc_compute_distance(HnswADCTable *table, HnswPQVector *pq_vec);
float hnsw_adc_compute_distance_multi(HnswADCTable *table, HnswPQVector **pq_vecs, int num_vecs, float *results);

/* Training and update management */
HnswPQTrainState *hnsw_pq_train_state_create(int max_samples);
void hnsw_pq_train_state_destroy(HnswPQTrainState *state);
void hnsw_pq_add_sample(HnswPQTrainState *state, HnswVector *vector, int dimensions);
bool hnsw_pq_needs_retrain(HnswPQTrainState *state);
void hnsw_pq_trigger_retrain(HnswIndex *index);

/* Hybrid mode (hot/cold data management) */
void hnsw_pq_check_hybrid_status(HnswIndex *index, HnswNode *node);
void hnsw_pq_promote_to_hot(HnswIndex *index, HnswNode *node);
void hnsw_pq_demote_to_cold(HnswIndex *index, HnswNode *node);

/* PQ distance computation with residual correction */
float hnsw_pq_distance_with_residual(HnswPQCodebook *codebook, HnswVector *query, HnswPQVector *pq_vec);
float hnsw_pq_distance_fast(HnswADCTable *table, HnswPQVector *pq_vec);

#endif							/* HNSW_H */
