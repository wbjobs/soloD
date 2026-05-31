import numpy as np
from ik_solver import IKSolver


class TrajectoryPlanner:
    def __init__(self):
        self.ik_solver = IKSolver()
    
    def quintic_polynomial(self, q0, qf, t0, tf):
        h = tf - t0
        a0 = q0
        a1 = 0
        a2 = 0
        a3 = 10 * (qf - q0) / (h**3)
        a4 = -15 * (qf - q0) / (h**4)
        a5 = 6 * (qf - q0) / (h**5)
        return [a0, a1, a2, a3, a4, a5]
    
    def evaluate_quintic(self, coeffs, t, t0):
        tau = t - t0
        return coeffs[0] + coeffs[1]*tau + coeffs[2]*tau**2 + coeffs[3]*tau**3 + coeffs[4]*tau**4 + coeffs[5]*tau**5
    
    def plan_trajectory(self, waypoints, duration_per_segment=2.0, samples_per_segment=50):
        if len(waypoints) < 2:
            return {'success': False, 'message': '至少需要2个目标点'}
        
        joint_trajectory = []
        
        previous_angles = None
        for i, point in enumerate(waypoints):
            x, y, z = point
            
            result = self.ik_solver.solve(x, y, z, initial_guess=previous_angles)
            
            if not result['success']:
                return {
                    'success': False,
                    'message': f'第{i+1}个目标点求解失败: ({x:.3f}, {y:.3f}, {z:.3f})'
                }
            
            joint_trajectory.append({
                'position': [x, y, z],
                'angles_rad': result['angles_rad'],
                'angles_deg': result['angles_deg']
            })
            
            previous_angles = result['angles_rad']
        
        full_trajectory = []
        
        for i in range(len(joint_trajectory) - 1):
            start = joint_trajectory[i]
            end = joint_trajectory[i + 1]
            
            polynomials = []
            for j in range(6):
                coeffs = self.quintic_polynomial(
                    start['angles_rad'][j],
                    end['angles_rad'][j],
                    0,
                    duration_per_segment
                )
                polynomials.append(coeffs)
            
            for s in range(samples_per_segment):
                t = (s / samples_per_segment) * duration_per_segment
                angles = [self.evaluate_quintic(poly, t, 0) for poly in polynomials]
                angles_deg = [np.degrees(a) for a in angles]
                
                full_trajectory.append({
                    'segment': i,
                    'progress': s / samples_per_segment,
                    'angles_rad': angles,
                    'angles_deg': angles_deg,
                    'from_point': start['position'],
                    'to_point': end['position']
                })
        
        full_trajectory.append({
            'segment': len(joint_trajectory) - 1,
            'progress': 1.0,
            'angles_rad': joint_trajectory[-1]['angles_rad'],
            'angles_deg': joint_trajectory[-1]['angles_deg'],
            'from_point': joint_trajectory[-2]['position'] if len(joint_trajectory) > 1 else joint_trajectory[-1]['position'],
            'to_point': joint_trajectory[-1]['position']
        })
        
        return {
            'success': True,
            'waypoints': joint_trajectory,
            'trajectory': full_trajectory,
            'total_frames': len(full_trajectory),
            'duration': (len(joint_trajectory) - 1) * duration_per_segment
        }
    
    def linear_interpolation_trajectory(self, waypoints, duration_per_segment=2.0, samples_per_segment=50):
        if len(waypoints) < 2:
            return {'success': False, 'message': '至少需要2个目标点'}
        
        joint_trajectory = []
        
        previous_angles = None
        for i, point in enumerate(waypoints):
            x, y, z = point
            
            result = self.ik_solver.solve(x, y, z, initial_guess=previous_angles)
            
            if not result['success']:
                return {
                    'success': False,
                    'message': f'第{i+1}个目标点求解失败: ({x:.3f}, {y:.3f}, {z:.3f})'
                }
            
            joint_trajectory.append({
                'position': [x, y, z],
                'angles_rad': result['angles_rad'],
                'angles_deg': result['angles_deg']
            })
            
            previous_angles = result['angles_rad']
        
        full_trajectory = []
        
        for i in range(len(joint_trajectory) - 1):
            start = joint_trajectory[i]
            end = joint_trajectory[i + 1]
            
            for s in range(samples_per_segment):
                alpha = s / samples_per_segment
                alpha_smooth = alpha * alpha * (3 - 2 * alpha)
                
                angles = [
                    start['angles_rad'][j] * (1 - alpha_smooth) + end['angles_rad'][j] * alpha_smooth
                    for j in range(6)
                ]
                angles_deg = [np.degrees(a) for a in angles]
                
                full_trajectory.append({
                    'segment': i,
                    'progress': alpha,
                    'angles_rad': angles,
                    'angles_deg': angles_deg,
                    'from_point': start['position'],
                    'to_point': end['position']
                })
        
        full_trajectory.append({
            'segment': len(joint_trajectory) - 1,
            'progress': 1.0,
            'angles_rad': joint_trajectory[-1]['angles_rad'],
            'angles_deg': joint_trajectory[-1]['angles_deg'],
            'from_point': joint_trajectory[-2]['position'] if len(joint_trajectory) > 1 else joint_trajectory[-1]['position'],
            'to_point': joint_trajectory[-1]['position']
        })
        
        return {
            'success': True,
            'waypoints': joint_trajectory,
            'trajectory': full_trajectory,
            'total_frames': len(full_trajectory),
            'duration': (len(joint_trajectory) - 1) * duration_per_segment
        }
