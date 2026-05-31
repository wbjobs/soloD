import numpy as np
from scipy.optimize import minimize
import warnings

warnings.filterwarnings('ignore')


class IKSolver:
    def __init__(self):
        self.link_lengths = [0.15, 0.15, 0.15, 0.1, 0.08, 0.05]
        self.joint_limits = [
            (-np.pi, np.pi),
            (-np.pi/2, np.pi/2),
            (-np.pi/2, np.pi/2),
            (-np.pi, np.pi),
            (-np.pi/2, np.pi/2),
            (-np.pi, np.pi)
        ]
        self.max_reach = sum(self.link_lengths[:4]) * 0.9
    
    def forward_kinematics(self, angles):
        try:
            angles = np.clip(angles, [l[0] for l in self.joint_limits], [l[1] for l in self.joint_limits])
            theta1, theta2, theta3, theta4, theta5, theta6 = angles
            
            T01 = self.dh_matrix(theta1, 0, 0, np.pi/2)
            T12 = self.dh_matrix(theta2, 0, self.link_lengths[0], 0)
            T23 = self.dh_matrix(theta3, 0, self.link_lengths[1], 0)
            T34 = self.dh_matrix(theta4, 0, self.link_lengths[2], np.pi/2)
            T45 = self.dh_matrix(theta5, 0, 0, -np.pi/2)
            T56 = self.dh_matrix(theta6, 0, self.link_lengths[3], 0)
            
            T06 = T01 @ T12 @ T23 @ T34 @ T45 @ T56
            
            position = T06[:3, 3]
            
            if np.any(np.isnan(position)) or np.any(np.isinf(position)):
                return np.array([0.0, 0.3, 0.0])
            
            return position
        except Exception:
            return np.array([0.0, 0.3, 0.0])
    
    def dh_matrix(self, theta, d, a, alpha):
        cos_theta = np.clip(np.cos(theta), -1.0, 1.0)
        sin_theta = np.clip(np.sin(theta), -1.0, 1.0)
        cos_alpha = np.clip(np.cos(alpha), -1.0, 1.0)
        sin_alpha = np.clip(np.sin(alpha), -1.0, 1.0)
        
        return np.array([
            [cos_theta, -sin_theta * cos_alpha, sin_theta * sin_alpha, a * cos_theta],
            [sin_theta, cos_theta * cos_alpha, -cos_theta * sin_alpha, a * sin_theta],
            [0.0, sin_alpha, cos_alpha, d],
            [0.0, 0.0, 0.0, 1.0]
        ])
    
    def objective_function(self, angles, target_pos):
        current_pos = self.forward_kinematics(angles)
        error = np.sum((current_pos - target_pos)**2)
        
        regularization = 0.001 * np.sum(angles**2)
        
        if np.isnan(error) or np.isinf(error):
            return 1e10
        
        return error + regularization
    
    def is_in_workspace(self, x, y, z):
        distance = np.sqrt(x**2 + y**2 + z**2)
        return 0.05 < distance < self.max_reach
    
    def solve(self, target_x, target_y, target_z, initial_guess=None):
        try:
            target_pos = np.array([target_x, target_y, target_z])
            
            if np.any(np.isnan(target_pos)) or np.any(np.isinf(target_pos)):
                return {
                    'success': False,
                    'message': '目标位置包含无效数值'
                }
            
            if not self.is_in_workspace(target_x, target_y, target_z):
                return {
                    'success': False,
                    'message': '目标位置超出工作空间'
                }
            
            initial_guesses = [
                np.zeros(6),
                np.array([0.0, np.pi/4, -np.pi/4, 0.0, 0.0, 0.0]),
                np.array([np.pi/4, 0.0, 0.0, 0.0, 0.0, 0.0]),
                np.array([-np.pi/4, np.pi/6, -np.pi/3, 0.0, 0.0, 0.0]),
            ]
            
            if initial_guess is not None:
                initial_guesses.insert(0, np.array(initial_guess))
            
            best_result = None
            best_error = float('inf')
            
            for guess in initial_guesses:
                try:
                    bounds = self.joint_limits
                    
                    result = minimize(
                        self.objective_function,
                        guess,
                        args=(target_pos,),
                        method='SLSQP',
                        bounds=bounds,
                        options={'maxiter': 500, 'ftol': 1e-6, 'disp': False}
                    )
                    
                    if result.success:
                        angles = result.x
                        
                        if np.any(np.isnan(angles)) or np.any(np.isinf(angles)):
                            continue
                        
                        angles = np.clip(angles, [l[0] for l in self.joint_limits], [l[1] for l in self.joint_limits])
                        
                        error = self.objective_function(angles, target_pos)
                        
                        if error < best_error:
                            best_error = error
                            best_result = angles
                            
                            if error < 1e-6:
                                break
                                
                except Exception:
                    continue
            
            if best_result is not None:
                angles = best_result.tolist()
                angles_deg = [np.degrees(a) for a in angles]
                
                final_pos = self.forward_kinematics(angles).tolist()
                
                if any(np.isnan(a) for a in angles) or any(np.isnan(a) for a in angles_deg):
                    return {
                        'success': False,
                        'message': '求解结果包含无效数值，请尝试其他位置'
                    }
                
                return {
                    'success': True,
                    'angles_rad': angles,
                    'angles_deg': angles_deg,
                    'position': final_pos,
                    'error': float(best_error)
                }
            else:
                return {
                    'success': False,
                    'message': '无法找到有效解，请尝试其他位置'
                }
                
        except Exception as e:
            return {
                'success': False,
                'message': f'求解过程出错: {str(e)}'
            }
