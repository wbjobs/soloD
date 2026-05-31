/*-------------------------------------------------------------------------
 *
 * hnsw_distance.c
 *	  Distance calculation functions for HNSW index
 *
 *-------------------------------------------------------------------------
 */

#include "postgres.h"
#include "hnsw.h"
#include <math.h>

#ifdef __AVX2__
#include <immintrin.h>
#endif

/*
 * Baseline L2 distance calculation (non-SIMD)
 */
float
hnsw_l2_distance(HnswVector *a, HnswVector *b, int dimensions)
{
	float		sum = 0.0f;
	int			i;

	for (i = 0; i < dimensions; i++)
	{
		float		diff = a[i] - b[i];
		sum += diff * diff;
	}

	return sqrtf(sum);
}

/*
 * Baseline cosine distance calculation (non-SIMD)
 * Cosine distance = 1 - cosine similarity
 */
float
hnsw_cosine_distance(HnswVector *a, HnswVector *b, int dimensions)
{
	float		dot_product = 0.0f;
	float		norm_a = 0.0f;
	float		norm_b = 0.0f;
	int			i;

	for (i = 0; i < dimensions; i++)
	{
		dot_product += a[i] * b[i];
		norm_a += a[i] * a[i];
		norm_b += b[i] * b[i];
	}

	if (norm_a == 0.0f || norm_b == 0.0f)
		return 1.0f;

	return 1.0f - (dot_product / sqrtf(norm_a * norm_b));
}

#ifdef __AVX2__

/*
 * L2 distance calculation using AVX2
 */
float
hnsw_l2_distance_avx2(HnswVector *a, HnswVector *b, int dimensions)
{
	__m256		sum = _mm256_setzero_ps();
	int			i;

	for (i = 0; i + 7 < dimensions; i += 8)
	{
		__m256		vec_a = _mm256_loadu_ps(&a[i]);
		__m256		vec_b = _mm256_loadu_ps(&b[i]);
		__m256		diff = _mm256_sub_ps(vec_a, vec_b);
		sum = _mm256_add_ps(sum, _mm256_mul_ps(diff, diff));
	}

	float		result[8];
	_mm256_storeu_ps(result, sum);

	float		total = result[0] + result[1] + result[2] + result[3] +
		result[4] + result[5] + result[6] + result[7];

	for (; i < dimensions; i++)
	{
		float		diff = a[i] - b[i];
		total += diff * diff;
	}

	return sqrtf(total);
}

/*
 * Cosine distance calculation using AVX2
 */
float
hnsw_cosine_distance_avx2(HnswVector *a, HnswVector *b, int dimensions)
{
	__m256		dot = _mm256_setzero_ps();
	__m256		norm_a = _mm256_setzero_ps();
	__m256		norm_b = _mm256_setzero_ps();
	int			i;

	for (i = 0; i + 7 < dimensions; i += 8)
	{
		__m256		vec_a = _mm256_loadu_ps(&a[i]);
		__m256		vec_b = _mm256_loadu_ps(&b[i]);

		dot = _mm256_add_ps(dot, _mm256_mul_ps(vec_a, vec_b));
		norm_a = _mm256_add_ps(norm_a, _mm256_mul_ps(vec_a, vec_a));
		norm_b = _mm256_add_ps(norm_b, _mm256_mul_ps(vec_b, vec_b));
	}

	float		dot_result[8];
	float		norm_a_result[8];
	float		norm_b_result[8];

	_mm256_storeu_ps(dot_result, dot);
	_mm256_storeu_ps(norm_a_result, norm_a);
	_mm256_storeu_ps(norm_b_result, norm_b);

	float		dot_total = dot_result[0] + dot_result[1] + dot_result[2] + dot_result[3] +
		dot_result[4] + dot_result[5] + dot_result[6] + dot_result[7];
	float		norm_a_total = norm_a_result[0] + norm_a_result[1] + norm_a_result[2] + norm_a_result[3] +
		norm_a_result[4] + norm_a_result[5] + norm_a_result[6] + norm_a_result[7];
	float		norm_b_total = norm_b_result[0] + norm_b_result[1] + norm_b_result[2] + norm_b_result[3] +
		norm_b_result[4] + norm_b_result[5] + norm_b_result[6] + norm_b_result[7];

	for (; i < dimensions; i++)
	{
		dot_total += a[i] * b[i];
		norm_a_total += a[i] * a[i];
		norm_b_total += b[i] * b[i];
	}

	if (norm_a_total == 0.0f || norm_b_total == 0.0f)
		return 1.0f;

	return 1.0f - (dot_total / sqrtf(norm_a_total * norm_b_total));
}

#else

/* Fallback if AVX2 not available */
float
hnsw_l2_distance_avx2(HnswVector *a, HnswVector *b, int dimensions)
{
	return hnsw_l2_distance(a, b, dimensions);
}

float
hnsw_cosine_distance_avx2(HnswVector *a, HnswVector *b, int dimensions)
{
	return hnsw_cosine_distance(a, b, dimensions);
}

#endif

#ifdef __AVX512F__

/*
 * L2 distance calculation using AVX-512
 */
float
hnsw_l2_distance_avx512(HnswVector *a, HnswVector *b, int dimensions)
{
	__m512		sum = _mm512_setzero_ps();
	int			i;

	for (i = 0; i + 15 < dimensions; i += 16)
	{
		__m512		vec_a = _mm512_loadu_ps(&a[i]);
		__m512		vec_b = _mm512_loadu_ps(&b[i]);
		__m512		diff = _mm512_sub_ps(vec_a, vec_b);
		sum = _mm512_add_ps(sum, _mm512_mul_ps(diff, diff));
	}

	float		total = _mm512_reduce_add_ps(sum);

	for (; i < dimensions; i++)
	{
		float		diff = a[i] - b[i];
		total += diff * diff;
	}

	return sqrtf(total);
}

/*
 * Cosine distance calculation using AVX-512
 */
float
hnsw_cosine_distance_avx512(HnswVector *a, HnswVector *b, int dimensions)
{
	__m512		dot = _mm512_setzero_ps();
	__m512		norm_a = _mm512_setzero_ps();
	__m512		norm_b = _mm512_setzero_ps();
	int			i;

	for (i = 0; i + 15 < dimensions; i += 16)
	{
		__m512		vec_a = _mm512_loadu_ps(&a[i]);
		__m512		vec_b = _mm512_loadu_ps(&b[i]);

		dot = _mm512_add_ps(dot, _mm512_mul_ps(vec_a, vec_b));
		norm_a = _mm512_add_ps(norm_a, _mm512_mul_ps(vec_a, vec_a));
		norm_b = _mm512_add_ps(norm_b, _mm512_mul_ps(vec_b, vec_b));
	}

	float		dot_total = _mm512_reduce_add_ps(dot);
	float		norm_a_total = _mm512_reduce_add_ps(norm_a);
	float		norm_b_total = _mm512_reduce_add_ps(norm_b);

	for (; i < dimensions; i++)
	{
		dot_total += a[i] * b[i];
		norm_a_total += a[i] * a[i];
		norm_b_total += b[i] * b[i];
	}

	if (norm_a_total == 0.0f || norm_b_total == 0.0f)
		return 1.0f;

	return 1.0f - (dot_total / sqrtf(norm_a_total * norm_b_total));
}

#else

/* Fallback if AVX-512 not available */
float
hnsw_l2_distance_avx512(HnswVector *a, HnswVector *b, int dimensions)
{
	return hnsw_l2_distance_avx2(a, b, dimensions);
}

float
hnsw_cosine_distance_avx512(HnswVector *a, HnswVector *b, int dimensions)
{
	return hnsw_cosine_distance_avx2(a, b, dimensions);
}

#endif

/*
 * PostgreSQL callable function for L2 distance
 */
PG_FUNCTION_INFO_V1(l2_distance);

Datum
l2_distance(PG_FUNCTION_ARGS)
{
	ArrayType  *a = PG_GETARG_ARRAYTYPE_P(0);
	ArrayType  *b = PG_GETARG_ARRAYTYPE_P(1);
	int			dim_a,
				dim_b;
	HnswVector *vec_a,
			   *vec_b;
	float		dist;

	if (ARR_NDIM(a) != 1 || ARR_NDIM(b) != 1)
		ereport(ERROR,
				(errcode(ERRCODE_ARRAY_SUBSCRIPT_ERROR),
				 errmsg("vectors must be one-dimensional")));

	dim_a = ARR_DIMS(a)[0];
	dim_b = ARR_DIMS(b)[0];

	if (dim_a != dim_b)
		ereport(ERROR,
				(errcode(ERRCODE_ARRAY_SUBSCRIPT_ERROR),
				 errmsg("vectors must have the same dimensions")));

	if (dim_a > HNSW_MAX_DIM)
		ereport(ERROR,
				(errcode(ERRCODE_ARRAY_SUBSCRIPT_ERROR),
				 errmsg("vector dimensions exceed maximum of %d", HNSW_MAX_DIM)));

	vec_a = array_to_hnsw_vector(a, &dim_a);
	vec_b = array_to_hnsw_vector(b, &dim_b);

	dist = hnsw_l2_distance_avx2(vec_a, vec_b, dim_a);

	pfree(vec_a);
	pfree(vec_b);

	PG_RETURN_FLOAT8(dist);
}

/*
 * PostgreSQL callable function for cosine distance
 */
PG_FUNCTION_INFO_V1(cosine_distance);

Datum
cosine_distance(PG_FUNCTION_ARGS)
{
	ArrayType  *a = PG_GETARG_ARRAYTYPE_P(0);
	ArrayType  *b = PG_GETARG_ARRAYTYPE_P(1);
	int			dim_a,
				dim_b;
	HnswVector *vec_a,
			   *vec_b;
	float		dist;

	if (ARR_NDIM(a) != 1 || ARR_NDIM(b) != 1)
		ereport(ERROR,
				(errcode(ERRCODE_ARRAY_SUBSCRIPT_ERROR),
				 errmsg("vectors must be one-dimensional")));

	dim_a = ARR_DIMS(a)[0];
	dim_b = ARR_DIMS(b)[0];

	if (dim_a != dim_b)
		ereport(ERROR,
				(errcode(ERRCODE_ARRAY_SUBSCRIPT_ERROR),
				 errmsg("vectors must have the same dimensions")));

	if (dim_a > HNSW_MAX_DIM)
		ereport(ERROR,
				(errcode(ERRCODE_ARRAY_SUBSCRIPT_ERROR),
				 errmsg("vector dimensions exceed maximum of %d", HNSW_MAX_DIM)));

	vec_a = array_to_hnsw_vector(a, &dim_a);
	vec_b = array_to_hnsw_vector(b, &dim_b);

	dist = hnsw_cosine_distance_avx2(vec_a, vec_b, dim_a);

	pfree(vec_a);
	pfree(vec_b);

	PG_RETURN_FLOAT8(dist);
}
